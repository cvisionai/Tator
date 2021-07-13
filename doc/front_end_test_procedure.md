# Front End Test Procedure
This procedure outlines the tests to perform when a UI update has been made.

## Annotator Tests
------------------
Follow these steps to test the annotation tools.

### Localization Related Tests
1. Create a test project using setup_project.py
1. Open the project detail page for Test Project in the browser.
1. Create a new folder named "Folder A" and upload some videos into the project
1. Create a new folder named "Folder B" and upload some images into the project
1. Rename the section containing images to "Images" and videos to "Videos". Reload to verify that the name of these sections remains.
1. Right-click on the "Images" section and select "Archive folder"
1. Click on "Archived Folders" and verify the "Images" section shows up there. Reload to verify that it remains there.
1. Right-click on the "Images section and select "Restore folder"
1. Verify the "Images" section shows up in "Library". Reload to verify that it remains there.
1. Upon reload, verify the number of images and videos is correct in the section summaries.
1. Attempt to download the image section.
1. Attempt to download an individual image.
1. Attempt to download the video section.
1. Attempt to download an individual video.
1. Open an image.
1. Draw 3 boxes.
1. Change the Enum attribute of each of the three boxes to different values. Verify that each box is a different color.
1. Move the boxes around and resize them. Reload to verify the changes persist.
1. Create a few lines, drawn in different directions.
1. Create a few dots.
1. Select the Baseline version, then make some dots there too.
1. Go back to the Test Version version, and verify that the dots created on each layer appear and have different colors.
1. Reload and make sure everything looks the same.
1. Zoom in on the canvas, pan, and zoom out.
1. Change values of the String attribute and verify that the grouping in the entity browser is updated appropriately.
1. Take a screenshot of some boxes and verify that the image matches what is boxed on the canvas.
1. Click the redraw icon on some localizations and redraw. Reload to verify the localizations are the same.
1. Select some localizations with the entity browser and delete them with both the del key and the trash icon.
1. Reload to make sure they are really gone.
1. Go back to the project detail page and attempt to download annotations for the Images section.
1. Repeat steps 18-26 on a video.
1. Perform cut and paste with a localization
1. Verify selecting a localization with a URL highlights it with the white border
1. Verify selecting a localization-associated track with a URL highlights it with the white border
1. Verify deselecting and selecting a localization with mouse clicks changes the color between the colorMap and white
1. Use the auto frame jump to select entities in the browser. Verify the localization is highlighted with white.
1. Turn off auto frame jump in the entity browser and verify the localization select/deselect works in the canvas.
1. Perform the above with multi-view

### State Related Tests
1. Perform the following steps to test out state types in a single video
    - python3 ./setup_project --host <host> --token <token> --name <new_project_name> --create-state-latest-type --create-state-range-type --create-track-type
    - Upload a video
    - Create new states with the right click menu at various points in the video.
    - Alter the start frame, end frame, and corresponding booleans. Verify the timeline has the right regions highlighted.
    - Play the video and toggle the boolean switches in the activity frame panel. Verify the timeline bar is colored appropriately and the states are saved.
    - Create new tracks by clicking the Track button and drawing some boxes in different frames.
    - Create new tracks by drawing a box, right click on it and creating a track.
    - Extend the track and trim the track endpoints with the right click menu
    - Merge two tracks with the right click menu
    - Add detection (ie localization) to track with the right click menu
1. Perform the following steps to test out a state type (latest interpolation, frame association) in a multiview media
    - python3 ./setup_project --host <host> --token <token> --name <new_project_name> --create-state-latest-type --create-state-range-type
    - Upload same video twice and create a multiview video with the following:
    - python3 ./create_multi_video.py --host <host> --token <token> --project <project_id> --media <media_id_1> <media_id_2> --multi-media-name test --layout-rows 2 --layout-cols 1 --quality 360 --section-name test_multi_folder
    - Repeat frame-state creation (ie not tracks) from step 29

### Annotation Browser Tests
1. Upload a video in a project with the same types as step 1 from the "State Related Tests"
1. Draw a box, line, and dot on the same frame. When the save dialog appears, verify there is no track slider and "View Associated track-type-name" button in the modal/dialog.
1. Combine them all into the same track/state using the right click menu
1. Adjust the annotation browser so that no entity is selected. Click on one of the localizations and verify the annotation browser shows the track.
1. Use the back button on the annotation browser and click on line selector. Click on the box and verify the annotation browser shows the box type.
1. Verify there is a button to "View Associated track-type-name" and there is no track slider. Use it and verify the browser changes to the track.
1. Draw other boxes and verify those localizations do not have the "View Associated track-type-name" option.
1. Go to another frame, draw a box. Create a track from that box and extend the track forwards and backwards using the duplicate method. Repeat this step in another part of the window. Verify there are three tracks in the annotation browser.
1. Verify you can cycle between the three tracks using the entity selector.
1. Use the jump frame button on the three tracks and verify the video frame changes and the track is selected.
1. Use the track slider and verify the video frame changes and the track is selected.

## Video Playback Tests
-----------------------
Follow these steps to test the video playback capabilities.

Prerequisites:
- Single video with multiple streaming video qualities (preferably at least 144, 360, 720)
- Multiview video (at least 2 videos, preferably 4)

Steps
1. Upload a video
1. Ensure the playback rate is 1.0
1. Jump around to both buffered/unbuffered scrub regions. Make sure the high quality frame is shown
1. Play the video in an unbuffered scrub region. Verify video is playing back.
1. Rewind the video in an unbuffered scrub region. Verify video is playing back.
1. Repeat the above steps in a buffered region.
1. While playing, ensure the fast forward button, rewind button, playback rate control, and playback quality control widgets are disabled. The scrub buffer downloading should also be paused while playing.
1. Change the quality. Ensure the scrub buffer doesn't re-download/change.
1. Play the video and verifiy the quality changed.
1. Play the video 2 seconds from the end. Ensure it finishes the video.
1. Rewind the video 2 seconds from the beginning. Ensure it stops at 0.
1. Reload the video, change the rate to 4x, and jump to an unbuffered scrub region. Verify video plays.
1. Change the rate to 8x, and jump to an unbuffered scrub region. Attempt to play. Verify a window alert is displayed and the video does not play.
1. Change the quality to the highest quality (greater than 360p). In the next steps, verify in the next two steps the playback quality is lower than the selected quality.
1. In a buffered scrub region, play the video at the 8x rate. Verify the video is playing back at a faster rate.
1. Repeat the above while going playing backwards.
1. Scrub around the video (click on the timeline dot and drag around)
1. Use the spacebar to pause/play the video.
1. Use the r key to rewind the video.
1. Select the frame number in the timeline and jump to a new frame. Put in a larger number than max, verify the video jumps to the max frame. Put in a negative number and verify the video jumps to 0. Put in a non-number and verify nothing happens. Use the arrow keys and space bar and ensure shortcuts are disabled.
1. Repeat step 18 using the current time in the timeline.
1. Repeat the above steps with a multi-view video.
1. Open both single video and multi-view medias in a new tab. Verify there are no errors and video starts downloading when switching to the tab.
1. Open a single video. Zoom in a section in the video timeline. Scrub using the zoomed scrub bar and verify scrub works and the bounds are within the zoomed section. Repeat with a multi-view video.


## Video Settings Tests
-----------------------
Follow these steps to test the advanced video settings capabilities.

Prerequisites:
- Same as Video Playback Tests

Steps
1. Load a multi-view video
1. In the video settings dialog, verify the buffers are seek == highest, scrub == 360, 1x == 720, focus == highest, docked == 144
1. Change the settings, and verify the Restore Defaults button changes the settings back to the previous step
1. Toggle the display and verify the diagnostic box is toggled (should show up in middle of each video)
1. Change the scrub buffer quality and verify the scrub buffer resets and the video is being re-downloaded.
1. Change the qualities to lowest except for the docked quality. Make the docked quality the highest. Verify playback and scrubbing are at the lowest quality.
1. Focus a video. Verify the qualities are as expected (central/focused video 1x playback == focus quality, small videos 1x playback == docked quality)
1. Change to horizontal. Verify all qualities are expected (1x playback == normal 1x playback). Do the same with resetting the grid.
1. Change the quality in the dropdown box on the main annotator header. Verify in the video settings the 1x playback has changed. Change the 1x playback and verify the dropdown box has changed.
1. Restore defaults and verify playbacks and scrubbing are the same as normal/on document load.
1. Repeat the above steps with a single-view video, ignoring the steps with focus/docks source verification.


## Annotation Analytics Tests
-----------------------
Follow these steps to test the annotation analytics view.

Steps
1. Setup a project with create_analytics_test_project.py
1. Upload images and videos to the new project
1. Run the create_analytics_annotations.py tool with the appropriate --host <host> --token <token> --project <project> parameters. Save the output. This will be used to test the filtering options.
1. Open the annotation analytics view and verify the number of localizations match.
1. Using the filtering module add/remove conditions ability, apply the filters provided by output from the create_analytics_annotations.py tool above. Verify the number of annotations match the expected amounts.
1. Verify removing the filter condition pill boxes changes the search.
1. Click on an image annotation and verify the attributes and media show up. Verify the annotator links work.
1. Do the same annotation panel check with an annotation in a video.
1. Verify the lock changes the ability to change attributes in the annotation panel.
1. Clear all the filters before doing the next two steps.
1. Change a localization attribute value, change to a different page and select the same card. Verify the information is different. Go back to the original annotation and verify the attribute was still changed.
1. Perform the previous step using a media attribute.
1. Load a filter condition and jump to a page. Reload the page and verify you land on the same filter / page combination. Do the same with using the link button from the header.
1. Change the page size and verify the number of pages matches on both the top and bottom paginators.
1. Navigate the pages with both paginators and verify the annotation count in sequential order.
1. Verify the aspect/fill toggle changes the thumbnails
1. Verify the thumbnail size slider changes the card/thumbnail sizes.