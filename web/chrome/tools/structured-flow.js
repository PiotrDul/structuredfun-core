/**
 * StructuredFun javascript
 * flow: layout engine
 *
 * Flow only updates the widths and heights of the cells, so if a range of
 * cells (a < x < b) is being updated
 * 1. the coordinates of cells < a aren't affected
 * 2. the coordinates of cells > b are incremented by delta-b
 * delta-b is the change in major axis coordinate of b
 */
(function ($, sfun, undefined) {

    // ---------
    // CONSTANTS
    // ---------

    var debug = true;
    var $document = $(document);
    var cell_marker = 'cell-flow-specific';

    // ---------
    // FUNCTIONS
    // ---------

    var init = function () {
        var obj = {
            'context': this,
            'key': 'flow',
            'receiverRegistered': flow_registered,
            'receiverLayoutResized': flow_cellsResize,
            'receiverLayoutCleared': flow_cellsClear,
            'receiverLayoutCellRatioChange': flow_cellsCheckMinor,
            'receiverImageCentre': flow_imageCentreOffseq,
        };
        // not sure of init order, so push async
        sfun.push('registerLayout', obj);
    };

    // Layout API

    /**
     * called by sfun when ready
     */
    var flow_registered = function () {
        $('.resizeablecell').addClass('resizepending');
    };

    /**
     * clear sizes on visible cell
     */
    var flow_cellsClear = function () {
        // just whack them all
        $('.' + cell_marker).css({
            'width': '',
            'height': ''
        }).removeClass(cell_marker).removeClass('visible vispart visnear');
    };

    /**
     * refresh the visible cell sizes by minor axis then major
     * @param {object} range {first_1, last_n, selected} range of sequence numbers to resize
     * @todo need to thoroughly analyse speed of this
     */
    var flow_cellsResize = function (range) {
        var that = this;
        var direction = sfun.api_getDirection();
        // get total size of minor for use in cache searches
        var minorKey = (direction == 'x' ? sfun.api_getViewportHeight() : sfun.api_getViewportWidth());
        var $anchorpost = sfun.api_getCell(range.selected);
        if (!$anchorpost.length) {
            // if we can't find the selected image, just use the first
            $anchorpost = sfun.api_getCell(range.first_1);
        }
        if (debug && false) {
            console.log('flow_cellsResize calls [' + range.first_1 + '-' + range.last_n + ']');
        }
        // record the initial absolute coord of the image
        var selectedMajorCoordabsInitial = (direction == 'x' ? $anchorpost.offset().left : $anchorpost.offset().top);
        var scrollMajorCoordabsInitial = (direction == 'x' ? $document.scrollLeft() : $document.scrollTop());
        // fetch visible cells and group by major axis value
        var cellGroup = {};
        // iterate across visible and visnear cells
        for (var i = range.first_1; i <= range.last_n; ++i) {
            var $ent = sfun.api_$cell(i);
            // only include resizeablecells in the bucket
            if (!$ent.hasClass('resizeablecell')) {
                continue;
            }
            // store cell in correct bucket, by position on major axis
            _bucketCell($ent, direction, cellGroup);
        }
        // allow for image alley and page gutter
        var spacing = (sfun.api_getAlley() * (sfun.api_getBreadth() - 1)) + (2 * sfun.api_getGutter());
        // viewport is parent for defining percentages of
        var viewportBounds = {
            'minor': (
                direction == 'x' ?
                    // trim minor axis because we lose some fillable space to margins
                    sfun.api_getViewportHeight() - spacing :
                    sfun.api_getViewportWidth() - spacing
            ),
            'major': (direction == 'x' ?
                    sfun.api_getViewportWidth() :
                    sfun.api_getViewportHeight()
            )
        };
        // work through all visible, top-level buckets
        for (var coordabs in cellGroup) {
            if (debug && false) {
                console.log('cellsResize processing bucket at[' + coordabs + '] of len[' + cellGroup[coordabs].length + ']');
            }
            _processBucket(cellGroup[coordabs], viewportBounds, $anchorpost, selectedMajorCoordabsInitial);
        }
        // now that all cells resized, realign using scrollbar instead of container position
        _cellsResizeRealignMajor($anchorpost, selectedMajorCoordabsInitial, scrollMajorCoordabsInitial);
        // return a resolved deferred in case we wait to make any of this resync in the future
        return $.Deferred().resolve();
    };

    /**
     * @param [string] direction
     * @param int image sequence number
     * @return {int} viewport centre offset by half the width of a cell (for this view size)
     */
    var flow_imageCentreOffseq = function (direction, seq) {
        var vpw = sfun.api_getViewportWidth(), vph = sfun.api_getViewportHeight();
        // work out how to centre image
        var viewport_ratio = vpw / vph;
        // pull image ratio from cell
        var $ent = sfun.api_$cell(seq);
        var $loadable = $ent.cachedFind('.loadable');
        var image_ratio = $loadable.data('ratio');
        if (image_ratio == undefined) {
            // if we don't have the cell size, just left-align instead of centring
            return 0;
        }
        // work out what the cell width will be when fullscreen
        var viewport_major, viewport_minor, cell_major;
        if (direction == 'x') {
            viewport_major = vpw;
            viewport_minor = vph;
            cell_major = image_ratio * viewport_minor;
        } else {
            viewport_major = vph;
            viewport_minor = vpw;
            cell_major = 1 / image_ratio * viewport_minor;
        }
        var viewport_midpoint = viewport_major / 2;
        var cell_midpoint = cell_major / 2;
        var offseq = sfun.api_round(viewport_midpoint - cell_midpoint, 0);
        // crop offseq against window bounds allowing for image bounds
        var border = sfun.api_getGutter();
        var max_offseq = viewport_major - cell_major - border;
        var min_offseq = 0 + border;
        var cropped = Math.max(Math.min(offseq, max_offseq), min_offseq);
        // optional debugging
        if (debug && false) {
            console.log('viewport_midpoint[' + viewport_midpoint + '] cell_midpoint[' + cell_midpoint + '] offseq[' + offseq + '] cropped[' + cropped + ']');
        }
        return cropped;
    };

    /**
     * check to see if we have ratios for all cells in minor, but haven't resized
     * @param {int} minor number (e.g. column number if direction x)
     * @return {object|boolean} range to update, or false for no update required
     */
    var flow_cellsCheckMinor = function (minor) {
        var breadth = sfun.api_getBreadth();
        var base = minor * breadth;
        var max = Math.min(base + breadth, sfun.api_getTotalEntries());
        var pre_marked = 0;
        // loop through all cells in this minor
        for (var i = base; i < max; ++i) {
            var $ent = sfun.api_$cell(i);
            // test to see if we've already set a specific minor to this cell
            if ($ent.hasClass(cell_marker)) {
                pre_marked++;
                continue;
            }
            var $loadable = $ent.cachedFind('> .container > .loadable');
            var ratio = $loadable.data('ratio');
            var status = $loadable.data('status');
            // if we discover an image hasn't been loaded yet
            if (status == sfun.imageStatusMISSING || status == sfun.imageStatusPENDING) {
                // bail out of the entire function
                return false;
            }
        }
        // all ratios loaded, check for un-sized cells
        if (pre_marked != breadth) {
            if (debug && false) {
                console.log('flow; flow_cellsCheckMinor can resize column[' + minor + '] ' + base + '-' + max);
            }
            return {'first_1': base, 'last_n': max - 1};
        }
        // otherwise flag that there were no changes
        return false;
    };

    //
    // FUNCTIONS: Helpers
    //

    /**
     * @param {array}  bucket                         array of jQuery entities
     * @param {object} parent                         {major, minor} of parent element/viewport
     * @param {object} [$selected]                   jQuery selected entity, used for comparison
     * @param {float}  [selectedMajorCoordabsInitial]
     */
    var _processBucket = function (bucket, parent, $selected, selectedMajorCoordabsInitial) {
        // get ratio and total
        var minorTotal = _cellsResizeTotalMinor(bucket);
        // resize minor axis and capture largest major axis size
        var largest_major = _cellsResizeBucketMinor(bucket, minorTotal, parent.minor);
        if (largest_major > parent.major) {
            if (debug && false) {
                console.log('minor[' + parent.minor + '] major_before[' + largest_major + '] major_after[' + parent.major + ']');
            }
            // limit largest_major (using parent major) but don't change the minors
            largest_major = parent.major;
        }
        // resize major axis
        _cellsResizeBucketMajor(bucket, largest_major, parent.major);
        // tidy up afterwards
        _cellsResizeBucketComplete(bucket);
        // find out if we need to realign
        if ($selected == undefined || selectedMajorCoordabsInitial == undefined) {
            // don't attempt to realign unless we've identified what we're aligning to
        } else {
            // realign selected against initial position
            _cellsResizeRealignMajor($selected, selectedMajorCoordabsInitial, false);
        }
    };

    /**
     * find cell's position on major axis, but put in appropriate bucket
     * @param  {object} $ent jQuery cell
     * @param  {string} direction of flow
     * @param  {object} group of buckets
     * @param  {object} [$parent] optional parent cell for this [sub]cell
     */
    var _bucketCell = function ($ent, direction, group, $parent) {
        var key = '';
        // add parent to cell if set
        if ($parent != undefined) {
            $ent.litter = $ent.litter || {};
            $ent.litter.$parent = $parent;
            // prepend parent name to bucket key
            key += $parent.data('seq') + '-';
        }
        // pull out the major axis coord
        var pos = $ent.offset();
        var coordabs = (direction == 'x' ? pos.left : pos.top);
        key += '' + coordabs;
        // if we don't have a bucket for this absolute coord, create one
        if (!(group[key] instanceof Array)) {
            group[key] = [];
        }
        // add $ent into bucket
        group[key][group[key].length] = $ent;
    };

    /**
     * calculate normalMinors their total
     * @param  {array} bucket collection of cells
     * @return {object} jQuery deferred with value of minorTotal
     */
    var _cellsResizeTotalMinor = function (bucket) {
        var normalMinor, minorTotal = 0;
        var direction = sfun.api_getDirection();
        for (var i = 0; i < bucket.length; ++i) {
            var $ent = bucket[i];
            var $boundable = $ent.cachedFind('> .container > .boundable');
            var ratio = $boundable.data('ratio');
            // calculate the normalised minor-axis size based on image ratio and size of cell
            // don't have to worry about margins here, because we're only ultimately interested in the ratio
            // of the images to one another
            normalMinor = (direction == 'x' ? $ent.width() / ratio : $ent.height() * ratio);
            // increment a tally of all the normalised minor-axis sizes (normalMinor)
            minorTotal += normalMinor;
            if (debug && false) {
                console.log('cellsResizeTotalMinor-' + $ent.data('seq') + ' ratio[' + ratio + '] normalMinor[' + normalMinor + ']');
            }
        }
        return minorTotal;
    };

    /**
     * resize all the minor axes
     * @param  {array} bucket collection of cells
     * @param  {real} minorTotal sum of all the minor axes
     * @return {real} maxMajor
     */
    var _cellsResizeBucketMinor = function (bucket, minorTotal, parentMinor) {
        var direction = sfun.api_getDirection();
        // calculate the total gutter+alley for all images
        var gutter_total = 2 * sfun.api_getGutter() * bucket.length;
        // change the cell minor according to proportion of total
        var proportion_sofar = 0;
        var gutter_proportional_sofar = 0;
        var maxMajor = 0;
        for (var i = 0; i < bucket.length; ++i) {
            var $ent = bucket[i];
            var $boundable = $ent.cachedFind('> .container > .boundable');
            // calculate the normal minor based on ratio
            var ratio = $boundable.data('ratio');
            var normalMinor = (direction == 'x' ? $ent.width() / ratio : $ent.height() * ratio);
            // calculate proportion as a percentage, round to 1 DP
            var proportion = sfun.api_round(100 * normalMinor / minorTotal, 1);
            var gutter_proportional = sfun.api_round(gutter_total * normalMinor / minorTotal, 1);
            var absolute = sfun.api_round(normalMinor * parentMinor / minorTotal, 1);
            // if this is the last cell in the bucket, fill to 100%
            if (i == bucket.length - 1) {
                proportion = 100 - proportion_sofar;
                gutter_proportional = gutter_total - gutter_proportional_sofar;
            } else {
                // otherwise tot up proportions so far
                proportion_sofar += proportion;
                gutter_proportional_sofar += gutter_proportional;
            }
            // apply percentage to cell minor
            var propname = (direction == 'x' ? 'height' : 'width');
            if (Modernizr.csscalc) {
                // set property using css calc to accommodate margins
                $ent[0].style[propname] = 'calc(' + proportion + '% - ' + gutter_proportional + 'px)';
            } else {
                $ent.css(propname, proportion + '%');
            }
            // update bound if necessary
            sfun.api_setBound($ent);
            // calculate normal major, max
            var newMinor = proportion * parentMinor / 100;
            maxMajor = Math.max(maxMajor, (direction == 'x' ? newMinor * ratio : newMinor / ratio));
            if (debug && false) {
                console.log('cellResizeBucketMinor-' + $ent.data('seq') + ' minor[' + normalMinor + '] major[' + (direction == 'x' ? normalMinor * ratio : normalMinor / ratio) + ']');
            }
        }
        return maxMajor;
    };

    /**
     * resize all the major axes
     * @param  {array} bucket collection of cells
     * @param  {real} maxMajor the largest major axis
     */
    var _cellsResizeBucketMajor = function (bucket, maxMajor, parentMajor) {
        var direction = sfun.api_getDirection();
        // calculate the new percentage major, bound (0-100), round (1DP)
        var proportion = sfun.api_round(Math.max(0, Math.min(100, (maxMajor) * 100 / parentMajor)), 1);
        var absolute = sfun.api_round(maxMajor, 1);
        // change all the majors
        for (var i = 0; i < bucket.length; ++i) {
            var $ent = bucket[i];
            $ent.css((direction == 'x' ? 'width' : 'height'), (false ? absolute + 'px' : proportion + '%'));
            $ent.addClass(cell_marker);
            if (debug && false) {
                console.log('cellResizeBucketMajor-' + $ent.data('seq') + ' major[' + proportion + '%]');
            }
        }
    };

    /**
     * tidy up after resize
     * @param  {array} bucket collection of cells
     */
    var _cellsResizeBucketComplete = function (bucket) {
        for (var i = 0; i < bucket.length; ++i) {
            var $ent = bucket[i];
            // // make all images y-bound, as it's a simpler alignment than
            // var $boundable = $ent.cachedFind('> .container > .boundable');
            // $boundable.removeClass('x-bound').addClass('y-bound');
            // also remove any 'pending resize' flags
            $ent.removeClass('resizepending');
        }
    };

    /**
     * realign a given cell with its initial position
     * @param  {object} $selected jQuery selected image
     * @param  {real} initial_anchor selected major absolute coord
     * @param  {real | false} initial_scroll non-null to align using scrollbar, false using container position
     */
    var _cellsResizeRealignMajor = function ($selected, initial_anchor, initial_scroll) {
        var direction = sfun.api_getDirection();
        var coordabs = (direction == 'x' ? $selected.offset().left : $selected.offset().top);
        // diff is the difference between where the image was (before resize) and where it is now
        var diff = sfun.api_round(initial_anchor - coordabs, 2);
        var csel = sfun.api_getLayoutRoot();
        var property = (direction == 'x' ? 'left' : 'top');
        // get the container's current csel offset (without 'px')
        var cselOffset = sfun.api_round(parseFloat(csel.css(property)), 2);
        if (initial_scroll === false) {
            // add diff to current csel offset
            csel.css(property, cselOffset + diff);
        } else {
            // stop using container
            csel.css(property, 0);
            // work out where the selected image is now
            var coordabs = (direction == 'x' ? $selected.offset().left : $selected.offset().top);
            // offset by same amount as initial difference
            var scrollabs = coordabs - (initial_anchor - initial_scroll);
            var newpos = {
                'scrollLeft': (direction == 'x' ? scrollabs : 0),
                'scrollTop': (direction == 'x' ? 0 : scrollabs)
            };
            // get current position to see if it's changed
            var oldpos = {'scrollLeft': $document.scrollLeft(), 'scrollTop': $document.scrollTop()};
            // if we're changing position, fire scroll
            if ((newpos.scrollLeft != oldpos.scrollLeft) || (newpos.scrollTop != oldpos.scrollTop)) {
                // note: async scroll will not expose new cells, only realign without container offset
                // @todo need to crop this new position against viewport
                sfun.api_triggerScroll(newpos, true);
            }
        }
    };

    // call init function
    init();

})(jQuery, window.sfun, undefined);
