""" TODO: add documentation for this """
import logging
import os
import json
import subprocess
import math
import io
import textwrap
import mmap
import sys

from PIL import Image, ImageDraw, ImageFont
from django.conf import settings

logger = logging.getLogger(__name__)

class MediaUtil:
    """ TODO: add documentation for this """
    def __init__(self, video, temp_dir, quality=None):
        self._temp_dir = temp_dir
        # Do this for testing:
        #self._temp_dir = '/data/media/temp'
        # If available we only attempt to fetch
        # the part of the file we need to
        self._segment_info = None

        if video.media_files:
            if quality is None:
                quality_idx = 0
            else:
                max_delta = sys.maxsize
                for idx, media_info in enumerate(video.media_files["streaming"]):
                    delta = abs(quality-media_info['resolution'][0])
                    if delta < max_delta:
                        quality_idx = idx
            self._video_file = video.media_files["streaming"][quality_idx]["path"]
            self._height = video.media_files["streaming"][quality_idx]["resolution"][0]
            self._width = video.media_files["streaming"][quality_idx]["resolution"][1]
            segment_file = video.media_files["streaming"][quality_idx]["segment_info"]
            segment_file = os.path.relpath(segment_file, settings.MEDIA_URL)
            segment_file = os.path.join(settings.MEDIA_ROOT, segment_file)
            with open(segment_file, 'r') as f_p:
                self._segment_info = json.load(f_p)
                self._moof_data = [(i, x) for i, x in enumerate(self._segment_info['segments']
                                                                ) if x['name'] == 'moof']
        elif video.original:
            video_file = video.original
            self._height = video.height
            self._width = video.width
            # Make file relative to URL to be consistent with streaming files below
            video_file = os.path.relpath(video_file, settings.MEDIA_ROOT)
            self._video_file = os.path.join(settings.MEDIA_URL, video_file)
        elif video.file:
            video_file = video.file.path
            self._height = int((min(video.height, 720) / video.height) * video.height)
            self._width = int((self._height / video.height) * video.width)
            # Make file relative to URL to be consistent with streaming files below
            video_file = os.path.relpath(video_file, settings.MEDIA_ROOT)
            self._video_file = os.path.join(settings.MEDIA_URL, video_file)

        self._video_file = os.path.relpath(self._video_file, settings.MEDIA_URL)
        self._video_file = os.path.join(settings.MEDIA_ROOT, self._video_file)

        self._fps = video.fps

    def get_impacted_segments(self, frames):
        """ TODO: add documentation for this """
        if self._segment_info is None:
            return None


        segment_list = []
        for frame_str in frames:
            frame_seg = set()
            frame_seg.add(0)
            frame_seg.add(1)
            # We already load the header so ignore those segments
            frame = int(frame_str)
            min_idx = 0
            max_idx = len(self._moof_data)-1
            # Handle frames and files with frame biases
            if frame < self._moof_data[0][1]['frame_start']:
                frame_seg.add(self._moof_data[0][0])
                continue

            last_segment = self._moof_data[max_idx][1] #Frame start/stop is in the moof
            if frame >= last_segment['frame_start'] + last_segment['frame_samples']:
                continue

            # Do a binary search for the segment in question
            while min_idx <= max_idx:
                guess_idx = math.floor((max_idx + min_idx) / 2)
                moof = self._moof_data[guess_idx][1]
                if frame < moof['frame_start']:
                    max_idx = max_idx - 1
                elif frame >= moof['frame_start'] + moof['frame_samples']:
                    min_idx = min_idx + 1
                else:
                    frame_seg.add(self._moof_data[guess_idx][0])
                    frame_seg.add(self._moof_data[guess_idx][0]+1)
                    if frame - moof['frame_start'] > moof['frame_samples'] - 5:
                        # Handle boundary conditions
                        if guess_idx + 1 in self._moof_data:
                            frame_seg.add(self._moof_data[guess_idx+1][0])
                            frame_seg.add(self._moof_data[guess_idx+1][0]+1)
                    break

            frame_seg = list(frame_seg)
            frame_seg.sort()
            segment_list.append((frame, frame_seg))
        logger.info(f"Given {frames}, we need {segment_list}")
        return segment_list

    def get_impacted_segments_from_ranges(self, frame_ranges):
        """ TODO: add documentation for this """
        segment_list = []
        logger.info(f"Frame Ranges = {frame_ranges}")
        for frame_range in frame_ranges:
            begin = frame_range[0]
            end = frame_range[1]
            begin_segments = self._getImpactedSegments([begin])
            end_segments = self._getImpactedSegments([end])
            range_segment_set = set()
            for frame_seg in [*begin_segments, *end_segments]:
                for segment in frame_seg:
                    range_segment_set.add(segment)
            start_missing = begin_segments[0][1][-1]
            end_missing = end_segments[0][1][2]
            for frame_seg in range(start_missing, end_missing):
                range_segment_set.add(frame_seg)
            range_segment = list(range_segment_set)
            range_segment.sort()
            segment_list.append((frame_range, range_segment))
        logger.info(f"Range-based segment list: {segment_list}")
        return segment_list

    def make_temporary_videos(self, segment_list):
        """ Return a temporary mp4 for each impacted segment to limit IO to
            cloud storage """
        lookup = {}
        for frame, segments in segment_list:
            temp_video = os.path.join(self._temp_dir, f"{frame}.mp4")
            sc_graph = [(0, 0)]
            segment_frame_start = sys.maxsize
            # create a scatter/gather
            for segment_idx in segments:
                segment = self._segment_info['segments'][segment_idx]
                last_io = sc_graph[len(sc_graph)-1]
                if segment.get('frame_start', sys.maxsize) < segment_frame_start:
                    segment_frame_start = segment['frame_start']
                if last_io[0] + last_io[1] == segment['offset']:
                    # merge contigous blocks
                    sc_graph[len(sc_graph)-1] = (last_io[0], last_io[1] + segment['size'])
                else:
                    # A new block
                    sc_graph.append((segment['offset'], segment['size']))

            lookup[frame] = (segment_frame_start, temp_video)

            logger.info(f"Scatter gather graph = {sc_graph}")
            with open(self._video_file, "r+b") as vid_fp:
                m_m = mmap.mmap(vid_fp.fileno(), 0)
                with open(temp_video, "wb") as out_fp:
                    for scatter in sc_graph:
                        out_fp.write(m_m[scatter[0]:scatter[0]+scatter[1]])

        return lookup


    def frame_to_time_str(self, frame, relative_to=None):
        """ TODO: add documentation for this """
        if relative_to:
            frame -= relative_to
        total_seconds = frame / self._fps
        hours = math.floor(total_seconds / 3600)
        minutes = math.floor((total_seconds % 3600) / 60)
        seconds = total_seconds % 60
        return f"{hours}:{minutes}:{seconds}"

    def generate_frame_images(self, frames, rois=None, render_format="jpg", force_scale=None):
        """ Generate a jpg for each requested frame and store in the working directory """
        frames = [int(frame) for frame in frames]
        crop_filter = None
        if rois:
            crop_filter = []
            for c in rois: #pylint: disable=invalid-name
                w = max(0, min(round(c[0]*self._width), self._width)) #pylint: disable=invalid-name
                h = max(0, min(round(c[1]*self._height), self._height)) #pylint: disable=invalid-name
                x = max(0, min(round(c[2]*self._width), self._width)) #pylint: disable=invalid-name
                y = max(0, min(round(c[3]*self._height), self._height)) #pylint: disable=invalid-name
                if force_scale:
                    scale_w = force_scale[0]
                    scale_h = force_scale[1]
                    crop_filter.append(f"crop={w}:{h}:{x}:{y},scale={scale_w}:{scale_h}")
                else:
                    crop_filter.append(f"crop={w}:{h}:{x}:{y}")

        logger.info(f"Processing {self._video_file}")
        args = ["ffmpeg"]
        inputs = []
        outputs = []

        # attempt to make a temporary file in a fast manner to speed up AWS access
        impacted_segments = self._getImpactedSegments(frames)
        lookup = {}
        if impacted_segments:
            lookup = self.makeTemporaryVideos(impacted_segments)

        for frame_idx, frame in enumerate(frames):
            outputs.extend(["-map", f"{frame_idx}:v", "-frames:v", "1", "-q:v", "3"])
            if crop_filter:
                outputs.extend(["-vf", crop_filter[frame_idx]])

            outputs.append(os.path.join(self._temp_dir, f"{frame_idx}.{render_format}"))
            if frame in lookup:
                inputs.extend(["-ss", self._frameToTimeStr(frame, lookup[frame][0]
                                                           ), "-i", lookup[frame][1]])
            else:
                # If we didn't make per segment mp4s, use the big one
                inputs.extend(["-ss", self._frameToTimeStr(frame), "-i", self._video_file])

        # Now add all the cmds in
        args.extend(inputs)
        args.extend(outputs)
        logger.info(args)
        proc = subprocess.run(args, check=True, capture_output=True)
        return proc.returncode == 0

    def get_clip(self, frame_ranges):
        """ Given a list of frame ranges generate a temporary mp4

            :param frameRanges: tuple or list of tuples representing (begin,
                                                                      end) -- range is inclusive!
        """
        if isinstance(frame_ranges, tuple):
            frame_ranges = [frame_ranges]

        impacted_segments = self._getImpactedSegmentsFromRanges(frame_ranges)
        assert not impacted_segments is None, "Unable to calculate impacted video segments"
        lookup = self.makeTemporaryVideos(impacted_segments)

        logger.info(f"Lookup = {lookup}")
        with open(os.path.join(self._temp_dir, "vid_list.txt"), "w") as vid_list:
            for idx, (_, f_p) in enumerate(lookup.values()):
                mux_0 = os.path.join(self._temp_dir, f"{idx}_0.mp4")
                args = ["ffmpeg",
                        "-i", f_p,
                        "-c", "copy",
                        "-muxpreload", "0",
                        "-muxdelay", "0",
                        mux_0]
                subprocess.run(args, check=True, capture_output=True)
                vid_list.write(f"file '{mux_0}'\n")

        output_file = os.path.join(self._temp_dir, "concat.mp4")
        args = ["ffmpeg",
                "-f", "concat",
                "-safe", "0",
                "-i", os.path.join(self._temp_dir, "vid_list.txt"),
                "-c", "copy",
                output_file]
        subprocess.run(args, check=True, capture_output=True)
        return output_file

    def is_video(self) -> bool:
        """ Returns true if the media is video or not
        """

        return self._fps is not None

    def get_width(self) -> int:
        """ Gets the width of the video/image in pixels
        """

        return self._width

    def get_height(self) -> int:
        """ Gets the height of the video/image in pixels
        """

        return self._height

    def get_cropped_image(self, roi, render_format="jpg", force_scale=None) -> str:
        """ Generate an image of the given ROI

        Args:
            roi: tuple
                (width, height, x, y) Relative values (0.0 .. 1.0)

            render_format: str
                'jpg' or 'png'

            force_scale: tuple
                (width: int, height: int) Forced image size in pixels

        Returns:
            Image file path
        """

        left = roi[2] * self._width
        upper = roi[3] * self._height
        right = left + roi[0] * self._width
        lower = upper + roi[1] * self._height

        img = Image.open(self._video_file)
        img = img.crop((left, upper, right, lower))

        if force_scale is not None:
            img = img.resize(force_scale)

        img_buf = io.BytesIO()
        if render_format == "jpg":
            img.save(img_buf, "jpeg", quality=95)
        else:
            img.save(img_buf, "png", quality=95)
        return img_buf.getvalue()

    def get_tile_image(self, frames, rois=None, tile_size=None,
                       render_format="jpg", force_scale=None):
        """ Generate a tile jpeg of the given frame/rois """
        # Compute tile size if not supplied explicitly
        try:
            if tile_size is not None:
                # check supplied tile size makes sense
                comps = tile_size.split('x')
                if len(comps) != 2:
                    raise ValueError("Bad Tile Size")
                if int(comps[0])*int(comps[1]) < len(frames):
                    raise ValueError("Bad Tile Size")
        except ValueError:
            tile_size = None
            # compute the required tile size
        if tile_size is None:
            width = math.ceil(math.sqrt(len(frames)))
            height = math.ceil(len(frames) / width)
            tile_size = f"{width}x{height}"

        if not self._generateFrameImages(frames, rois, render_format=render_format,
                                         force_scale=force_scale):
            return None

        output_file = None
        if len(frames) > 1:
            # Make a tiled jpeg
            tile_args = ["ffmpeg",
                         "-i", os.path.join(self._temp_dir, f"%d.{render_format}"),
                         "-vf", f"tile={tile_size}",
                         "-q:v", "3",
                         os.path.join(self._temp_dir, f"tile.{render_format}")]
            logger.info(tile_args)
            proc = subprocess.run(tile_args, check=True, capture_output=True)
            if proc.returncode == 0:
                output_file = os.path.join(self._temp_dir, f"tile.{render_format}")
        else:
            output_file = os.path.join(self._temp_dir, f"0.{render_format}")

        return output_file

    def get_animation(self, frames, roi, fps, render_format, force_scale):
        """ TODO: add documentation for this """
        if not self._generateFrameImages(frames, roi, render_format="jpg",
                                         force_scale=force_scale):
            return None

        mp4_args = ["ffmpeg",
                    "-framerate", str(fps),
                    "-i", os.path.join(self._temp_dir, "%d.jpg"),
                    os.path.join(self._temp_dir, "temp.mp4")]
        subprocess.run(mp4_args, check=True, capture_output=True)

        if render_format == 'mp4':
            temp_path = os.path.join(self._temp_dir, "temp.mp4")
        else:
            # Convert temporary mp4 into a gif
            gif_args = ["ffmpeg",
                        "-i", os.path.join(self._temp_dir, "temp.mp4"),
                        "-filter_complex",
                        "[0:v] split [a][b];[a] palettegen [p];[b][p] paletteuse",
                        os.path.join(self._temp_dir, "animation.gif")]
            logger.info(gif_args)
            subprocess.run(gif_args, check=True, capture_output=True)
            temp_path = os.path.join(self._temp_dir, "animation.gif")
        return temp_path

    @staticmethod
    def generate_error_image(code, message, img_format="png"):
        """ TODO: add documentation for this """
        font_bold = ImageFont.truetype("DejaVuSans-Bold.ttf", 32)
        font = ImageFont.truetype("DejaVuSans.ttf", 28)
        img = Image.open(os.path.join(settings.STATIC_ROOT,
                                      "images/computer.jpg"))
        draw = ImageDraw.Draw(img)
        W, H = img.size #pylint: disable=invalid-name

        x_bias = 60
        header = f"Error {code}"
        w, h = draw.textsize(header) #pylint: disable=invalid-name
        logger.info(f"{W}-{w}/2; {H}-{h}/2")
        offset = font.getoffset(header)
        logger.info(f"Offset = {offset}")

        draw.text((W/2-((w/2)+x_bias), 80), header, (255, 62, 29), font=font_bold)


        _, line_height = draw.textsize(message)
        line_height *= 3
        start_height = 200-line_height
        lines = textwrap.wrap(message, 17)
        for line_idx, line in enumerate(lines):
            draw.text((100, start_height+(line_height*line_idx)), line, (255, 62, 29), font=font)

        img_buf = io.BytesIO()
        if img_format == "jpg":
            img.save(img_buf, "jpeg", quality=95)
        else:
            img.save(img_buf, "png", quality=95)
        return img_buf.getvalue()
