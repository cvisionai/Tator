""" TODO: add documentation for this """
from typing import Tuple
from types import SimpleNamespace
import logging
import tempfile
import traceback

from rest_framework.response import Response
from rest_framework import status
from django.http import response

from ..models import Localization
from ..renderers import PngRenderer
from ..renderers import JpegRenderer
from ..renderers import GifRenderer
from ..renderers import Mp4Renderer
from ..schema import LocalizationGraphicSchema
from ._base_views import BaseDetailView
from ._media_util import MediaUtil
from ._permissions import ProjectViewOnlyPermission

logger = logging.getLogger(__name__)


class LocalizationGraphicAPI(BaseDetailView):
    """ Endpoint that retrieves an image of the requested localization
    """

    schema = LocalizationGraphicSchema()
    renderer_classes = (PngRenderer, JpegRenderer, GifRenderer, Mp4Renderer)
    permission_classes = [ProjectViewOnlyPermission]
    http_method_names = ['get']
    lookup_field = 'id'

    def get_queryset(self):
        """ Overridden method. Please refer to parent's documentation.
        """

        return Localization.objects.all()

    def handle_exception(self, exc):
        """ Overridden method. Please refer to parent's documentation.
        """
        logger.error(f"Exception in request: {traceback.format_exc()}")
        status_obj = status.HTTP_400_BAD_REQUEST
        if isinstance(exc, response.Http404):
            status_obj = status.HTTP_404_NOT_FOUND
        return Response(
            MediaUtil.generate_error_image(
                status_obj,
                str(exc),
                self.request.accepted_renderer.format),
            status=status_obj)

    def get_margins(self, localization_type: str, params: dict):
        """ Returns x/y margins to use based on the provided parameters and localization object

        Private helper method used by _get()

        Return(s):
            margins: SimpleNamespace
                x: int
                    Pixel margin for x/horizontal direction
                y: int
                    Pixel margin for y/vertical direction
        """

        margins = None

        if params.get(self.schema.PARAMS_USE_DEFAULT_MARGINS, None):

            if localization_type == 'dot':
                margins = self.schema.DEFAULT_MARGIN_DOT

            elif localization_type == 'line':
                margins = self.schema.DEFAULT_MARGIN_LINE

            elif localization_type == 'box':
                margins = self.schema.DEFAULT_MARGIN_BOX

            else:
                raise Exception(f'Error: Invalid meta.dtype detected {localization_type}')

        else:

            margin_x = params.get(self.schema.PARAMS_MARGIN_X, None)
            margin_y = params.get(self.schema.PARAMS_MARGIN_Y, None)
            margins = SimpleNamespace(x=margin_x, y=margin_y)

        assert margins.x >= 0 and margins.y >= 0

        return margins

    def get_roi(
            self,
            obj: str,
            params: dict,
            media_width: int,
            media_height: int) -> Tuple[float, float, float, float]:
        """ Returns the ROI to extract from the media for the given parameters

        Args:
            obj: Localization object
                Localization object that is the region of interest

            params: dict
                Parameters defined by the schema

            media_width: int
                Pixels of media the localization object is associated with

            media_height: int
                Pixels of media the localization object is associated with

        Returns:
            roi: tuple
                float: width (relative)
                float: height (relative)
                float: x (relative)
                float: y (relative)

        """

        # Get the initial image based on the localization type and requested margins
        localization_type = obj.meta.dtype
        margins_pixels = self._getMargins(localization_type=localization_type, params=params)

        # The roi input is done with normalized arguments. But the margins provided
        # are in pixels. So we've got to convert.
        SimpleNamespace(x=margins_pixels.x / media_width,
                        y=margins_pixels.y / media_height)

        # Take the position information available and apply the margin.
        # The stored position information is normalized, so we will set it to the
        # provided media pixel width/height, apply the appropriate region of interest (ROI)
        # information, then normalize back since the media_utils requires the ROI data
        # in that format.
        #
        # Position information available per localization type:
        #   Point/dot: x, y
        #   Line: x, y, u, v
        #   Box: x, y, width, height
        #
        # Region of interest format: width, height, x, y
        if localization_type == 'dot':

            roi_x = obj.x * media_width
            roi_y = obj.y * media_height

            roi = [2*margins_pixels.x + 1,
                   2*margins_pixels.y + 1,
                   roi_x - margins_pixels.x,
                   roi_y - margins_pixels.y]

        elif localization_type == 'line':

            x = obj.x * media_width #pylint: disable=invalid-name
            y = obj.y * media_height #pylint: disable=invalid-name
            u = obj.u * media_width #pylint: disable=invalid-name
            v = obj.v * media_height #pylint: disable=invalid-name

            point_a = SimpleNamespace(x=x, y=y)
            point_b = SimpleNamespace(x=x+u, y=y+v)

            width = abs(point_b.x - point_a.x)
            height = abs(point_b.y - point_a.y)

            roi_x = min(point_a.x, point_b.x)
            roi_y = min(point_a.y, point_b.y)

            roi = [width + 2*margins_pixels.x,
                   height + 2*margins_pixels.y,
                   roi_x - margins_pixels.x,
                   roi_y - margins_pixels.y]

        elif localization_type == 'box':

            roi_x = obj.x * media_width
            roi_y = obj.y * media_height
            roi_width = obj.width * media_width
            roi_height = obj.height * media_height

            roi = [roi_width + 2*margins_pixels.x,
                   roi_height + 2*margins_pixels.y,
                   roi_x - margins_pixels.x,
                   roi_y - margins_pixels.y]

        else:
            raise Exception(f"Invalid meta.dtype detected {localization_type}")

        # Don't allow any single pixel width/heights
        # Adding the 0.1 to deal with floating point precision
        roi[0] = max(roi[0], 2.1)
        roi[1] = max(roi[1], 2.1)

        # Now, normalize the ROI
        roi[0] = roi[0] / media_width
        roi[2] = roi[2] / media_width

        roi[1] = roi[1] / media_height
        roi[3] = roi[3] / media_height

        # Force the ROI to be within the image
        for idx, roi_entry in enumerate(roi):
            if roi_entry > 1.0:
                roi[idx] = 1.0
            elif roi_entry < 0.0:
                roi[idx] = 0.0

        return tuple(roi)

    def _get(self, params: dict):
        """ Overridden method. Please refer to parent's documentation.
        """

        # Get the localization associated with the given ID
        obj = Localization.objects.get(pk=params['id'])

        # Extract the force image size argument
        # assert if there's a problem with the provided inputs
        force_image_size = params.get(self.schema.PARAMS_IMAGE_SIZE, None)
        if force_image_size is not None:
            img_width_height = force_image_size.split('x')
            assert len(img_width_height) == 2
            requested_width = int(img_width_height[0])
            requested_height = int(img_width_height[1])
            assert requested_width > 0
            assert requested_height > 0
            force_image_size = (requested_width, requested_height)

        # By reaching here, it's expected that the graphics mode is to create a new
        # thumbnail using the provided parameters. That new thumbnail is returned
        with tempfile.TemporaryDirectory() as temp_dir:

            media_util = MediaUtil(video=obj.media, temp_dir=temp_dir)

            roi = self._getRoi(
                obj=obj,
                params=params,
                media_width=media_util.getWidth(),
                media_height=media_util.getHeight())

            if media_util.isVideo():
                # We will only pass a single frame and corresponding roi into this
                # so the expected output is only one tile instead of many
                image_path = media_util.getTileImage(
                    frames=[obj.frame],
                    rois=[roi],
                    tile_size=None,
                    render_format=self.request.accepted_renderer.format,
                    force_scale=force_image_size)

                with open(image_path, 'rb') as data_file:
                    response_data = data_file.read()

            else:
                # Grab the ROI from the image
                response_data = media_util.getCroppedImage(
                    roi=roi,
                    render_format=self.request.accepted_renderer.format,
                    force_scale=force_image_size)

        return response_data
