/**
 * StructuredFun javascript
 */
window.sfun = (function($, undefined) {

  var debug = true;

  // defaults
  this.defaultSeq = 0;
  this.defaultBreadth = null;
  this.defaultDirection = null;

  // ms to wait after resize event before re-bound/re-res
  this.resizeTimeout = null;
  // for screenpc width/height, set using px/pc
  this.setScreenPcUsing = null;

  // ---------
  // FUNCTIONS
  // ---------

  this.init = function() {
    var that = this;
    // initialise vars
    this.setScreenPcUsing = 'pc';
    $(document).ready(function() {
      // process state in page HTML next
      that.defaultDirection = that.getDirection();
      that.defaultBreadth = that.getBreadth();
      // bind to page
      that.bindToScroll();
      that.bindToHeaderLinks();
      that.bindToHotKeys();
      that.bindToHashChange();
      that.bindToImageLinks();
      // if we're sideways scrolling, bind to scroll event
      that.setDirection(that.getDirection());
      // find all screenpc elements, extract pc and store as data- attribute
      $('.screenpc-width').each(function() {
        return that.generate_data_pc($(this), 'width');
      }).promise().done(function() {
        $('.screenpc-height').each(function() {
          // can't simply use css('height') because it returns height in px not %
          // console.log($(this).css('height'));
          return that.generate_data_pc($(this), 'height');
        });
      }).promise().done(function() {
        // call refresh function to apply cell widths/heights
        refreshCells();
        // process state if set in URL (hash) first
        that.handler_hashChanged(History.getHash());
        // execute queue of API calls
        that.export.flush();
      })
      // attach listener to window for resize (rare, but should update)
      $(window).resize(function() {
        // if we're already timing out, delay for another x milliseconds
        if (that.resizeTimeout != null) {
          clearTimeout(this.resizeTimeout);
        }
        that.resizeTimeout = setTimeout(function() {
          that.refreshCells();
          that.refreshVisible(0);
        }, 50); // 50 ms
      });
    });
  };

  /**
   * Refresh element width/heights when screen size changes
   */
  this['refreshCells'] = function() {
    var that = this;
    var win = $(window), doc = $(document);
    var ww = win.width(), wh = win.height(), dw = doc.width(), dh = doc.height();
    var pcwidth = undefined, pcheight = undefined;
    // try to find a yardstick-(x/y) and use if found for width/height
    var yardx = $('#yardstick-x'), yardy = $('#yardstick-y');
    if (yardx.length) {
      ww = yardx.width();
    }
    if (yardy.length) {
      wh = yardy.height();
    }
    if (debug && false) {
      console.log('viewport w[' + ww + '] h[' + wh + ']');
    }
    // loop through all 'ready' elements
    $('.screenpc-ready').each(
      function() {
        var jqCell = $(this);
        var pxval, pcval;
        // read data-screen-pc-width|height if set
        pcwidth = jqCell.data('screenpc-width');
        pcheight = jqCell.data('screenpc-height');
        // resize cells as applicable
        if (that.setScreenPcUsing == 'pc') {
          // don't re-apply same pc every refresh
        } else {
          // apply screen percentage as pixels (px) or document percentage (dpc), transformed from window pc
          if (pcwidth) {
            pxval = ww * pcwidth / 100;
            pcval = (pxval * 100 / dw) + '%';
            jqCell.width(that.setScreenPcUsing == 'dpc' ? pcval : pxval);
            if (debug && false) {
              console.log('ww[' + ww + '] dw['+ dw +'] pcwidth[' + pcwidth + '] pxval[' + pxval + '] pcval[' + pcval + ']');
            }
          }
          if (pcheight) {
            pxval = wh * pcheight / 100;
            pcval = (pxval * 100 / dh) + '%';
            jqCell.height(that.setScreenPcUsing == 'dpc' ? pcval : pxval);
            if (debug && false) {
              console.log('wh[' + wh + '] dh[' + dh + '] pcheight[' + pcheight + '] pxval[' + pxval + '] pcval[' + pcval + ']');
            }
          }
          if (debug && false) {
            console.log('post-set screenpc[' + jqCell.attr('id') + '] w[' + pcwidth + '%] h[' + pcheight + '%] now w['+ jqCell.width() + '] h[' + jqCell.height() + ']');
          }
        }
      }
    );
  };

  /**
   * Extract percentage and store as data- attribute
   * 
   * @param object
   *          jQuery object
   * @param string
   *          {width|height} axis to extract percentage for
   */
  this['generate_data_pc'] = function(jq, axis) {
    var elemclass, elemid, elempc = undefined;
    // parse stylesheets for #id:width
    elemid = jq.attr('id');
    if (elemid != undefined) {
      // parse stylesheets for class(n):width
      elempc = this.lookupSelectorProp('#' + elemid, axis, '%');
    }
    if (elempc != undefined) {
      // found width on #id, apply to data
      jq.data('screenpc-' + axis, elempc).addClass('screenpc-ready');
    }
    else {
      // break class list into array
      elemclass = jq.attr('class').split(' ');
      // search list for a class defined in stylesheet
      for ( var i = 0; i < elemclass.length; i++) {
        var elemc = elemclass[i];
        // lookup class in style sheets to find width definition
        elempc = this.lookupSelectorProp('.' + elemc, axis, '%');
        if (elempc != undefined) {
          // found property, store in data tag
          jq.data('screenpc-' + axis, elempc).addClass('screenpc-ready');
          // don't carry on the search
          break;
        }
      }
    }
  };

  /**
   * Search for a property in a stylesheet class
   * 
   * @todo optimise, suggest caching of found rules
   * @param string
   *          element selector
   * @param string
   *          property to search for
   * @param [string]
   *          matchstrip characters to match and strip from the result
   */
  this['lookupSelectorProp'] = function(elem, prop) {
    var matchstrip = undefined;
    // look for optional third argument
    if (arguments.length > 2) {
      matchstrip = arguments[2];
    }
    // iterate over stylesheets
    for ( var j = 0; j < document.styleSheets.length; j++) {
      var rules = document.styleSheets[0].rules || document.styleSheets[0].cssRules;
      // iterate over rules within current stylesheet
      for ( var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (typeof(rule.selectorText) != 'undefined') {
          // test rule name against elem
          if (endswith(rule.selectorText, elem)) {
            if (debug && false) {
              console.log('matched rule[' + rule.selectorText + '] against elem[' + elem + ']');
            }
            var elempc = rule.style.getPropertyValue(prop);
            // if we actually found that property in this stylesheet class
            if (elempc != undefined) {
              // if we're suppose to match and strip characters from the end
              if (matchstrip != undefined) {
                // if the characters are there
                if (elempc.indexOf(matchstrip) !== -1) {
                  // if we can match it, strip it
                  elempc = elempc.replace(matchstrip, '');
                }
                else {
                  // but if we can't match it, don't return it at all
                  continue;
                }
              }
              return elempc;
            }
          }
        }
      }
    }
    return undefined;
  };

  /**
   * @param string
   *          to search within
   * @param string
   *          to search for
   * @return true if the haystack ends with the needle
   */
  this.endswith = function(haystack, needle) {
    // roll on ECMAScript 6
    return haystack.indexOf(needle, haystack.length - needle.length) !== -1;
  };

  /**
   * Check through all the images in this gallery for size/ratio/bounding/metadata
   */
  this['checkVisibleImages'] = function(waitForLoad) {
    var that = this;
    // try forcing all checks to waitForLoad
    waitForLoad = true;
    // re-check images
    $('.cell').each(function() {
      var callback = function(){
        // 1. look to see if the x-bound/y-bound has changed (note: async)
        that.checkImageBound($(this))
        .then(function(jqImg) {
          // 2. change out the image for a better resolution if it's onscreen
          that.checkImageRes(jqImg);
          // 3. check and update imgmetric
          that.checkMetricPosition(jqImg);
          // @todo change out folder thumbnails too
        });
      };
      // either we can check now, or check when the image loads
      if (waitForLoad) {
        // note callback in the args to one(), each is only a pusher
        $(this).find('img.bounded.visible').one('load', callback).each(function() {
          if(this.complete) $(this).load();
        });
      } else {
        $(this).find('img.bounded.visible').each(callback);
      }
    });
  }

  /**
   * update (x/y)-bound on image
   * 
   * @param jQuery
   *          object parent container, which has changed size
   * @param jQuery
   *          object bounded image within
   */
  this['checkImageBound'] = function(jqImg) {
    // use jQuery deferred promises
    var deferred = new $.Deferred();
    // queue up the bound checking
    deferred.then(function(jqImg) {
      var jqCell = jqImg.parents('li');
      // read container width/height
      var cx = jqCell.width(), cy = jqCell.height();
      var cratio = cx / cy;
      // detect if the image is bound by width/height in this container
      var ix = jqImg.data('loaded-width'), iy = jqImg.data('loaded-height');
      if (debug && false) {
        console.log('image '+jqImg.attr('id')+' ['+ix+','+iy+'] checking bound within ['+cx+','+cy+']');
      }
      var iratio = ix / iy;
      var direction = ((cratio / iratio) > 1.0 ? 'y' : 'x');
      var invdir = (direction == 'x' ? 'y' : 'x');
      if (debug && false) {
        console.log('cx[' + cx + '] cy[' + cy + '] cratio[' + cratio + '], ix[' + ix + '] iy[' + iy + '] iratio['
            + iratio + ']: ' + (cratio / iratio).toPrecision(3) + '= ' + direction + '-bound');
      }
      // apply class to image
      jqImg.addClass(direction + '-bound').removeClass(invdir + '-bound');
    });
    // but update loaded resolution if necessary first
    if (jqImg.data('loaded-width') == undefined || jqImg.data('loaded-height') == undefined) {
      if (debug) {
        console.log('image '+jqImg.attr('id')+' update loaded resolution');
      }
      this.getLoadedResolution(jqImg, deferred);
    } else {
      // either way flag that this image has loaded-width/height updated
      deferred.resolve(jqImg);
    }
    // return object so that outside code can queue functions to get notified on resolve
    // but restrict using promise() so we cannot interfere with it
    return deferred.promise();
  };

  /**
   * Check the display resolution of the image and swap out src if higher res available 
   */
  this['checkImageRes'] = function(jqImg) {
    var resbracket = 250, brackWidth, brackHeight;
    var imageWidth = jqImg.width() * window.devicePixelRatio;
    var imageHeight = jqImg.height() * window.devicePixelRatio;
    var loadedWidth = jqImg.data('loaded-width');
    var loadedHeight = jqImg.data('loaded-height');
    var nativeWidth = jqImg.data('native-width');
    var nativeHeight = jqImg.data('native-height');
    var bigger = imageWidth > loadedWidth || imageHeight > loadedHeight;
    var available = loadedWidth < nativeWidth || loadedHeight < nativeHeight;
    var swappedOut = false, metaedOut = false;
    if (debug && false) {
      console.log('image '+jqImg.attr('id')+': checking resolution');
    }
    // test to see if we're displaying an image at more than 100%
    if (typeof(nativeWidth) == 'undefined' || typeof(nativeHeight) == 'undefined') {
      // fire request for metadata, then callback this (checkImageRes) function later
      this.checkMetadata(jqImg);
      metaedOut = true;
    } else {
      var bigger = imageWidth > loadedWidth || imageHeight > loadedHeight;
      var available = loadedWidth < nativeWidth || loadedHeight < nativeHeight;
      // test to see if we're displaying an image at more than 100%
      if (bigger && available) {
        // only need to think about one dimension, because ratio of image is fixed
        var majorw = (imageWidth >= imageHeight);
        // but that dimension has to be the major dimension 
        if (majorw) {
          // find the smallest resbracket less than nativeWidth, but greater that loadedWidth
          brackWidth = Math.min(Math.ceil(imageWidth/resbracket) * resbracket, nativeWidth);
          // could have resized down, so only swap the image if the brackWidth is greater that the current loaded
          if (brackWidth > loadedWidth) {
            this.swapImageOut(jqImg, jqImg.data('base-src') + 'maxwidth='+brackWidth);
            swappedOut = true;
            // console.log('swap imageWidth['+imageWidth+'] brackWidth['+brackWidth+']');        
          }
        } else {
          // same but pivot on height rather than width
          brackHeight = Math.min(Math.ceil(imageHeight/resbracket) * resbracket, nativeHeight);
          if (brackHeight > loadedHeight) {
            this.swapImageOut(jqImg, jqImg.data('base-src') + 'maxheight='+brackHeight);
            swappedOut = true;
          }
        }
      }
    }
    // if we didn't swap out this image or go off to check its metadata, update imgmetric
    // @todo maybe can comment this
    if (!swappedOut && !metaedOut) {
      this.checkMetric(jqImg);
    }
    // console.log('checking '+jqImg.attr('id')+' w['+imageWidth+'] h['+imageHeight+'] nativeWidth['+nativeWidth+'] nativeHeight['+nativeHeight+'] loadedWidth['+loadedWidth+'] loadedHeight['+loadedHeight+']');
  };

  /**
   * Request metadata about this image from the server
   */
  this['checkMetadata'] = function(jqImg) {
    var that = this;
    $.ajax({
      url: jqImg.attr('src').replace('image','imagemeta'),
      dataType: 'json',
    })
    .done(function( data ) {
      that.processMetadata(jqImg, data);
    });
  };

  /**
   * Store processed metadata in data- attributes if returned
   */
  this['processMetadata'] = function(jqImg, data) {
    if (typeof(data.meta) != 'undefined') {
      jqImg.data('native-width', data.meta.width);
      jqImg.data('native-height', data.meta.height);
      // console.log('received metadata width['+jqImg.data('native-width')+']');
      // trigger image resolution check again now that we've updated data- attributes
      this.checkImageRes(jqImg);
    }
  };
  
  /**
   * Swap out image using a temporary image (to get triggered on load event)
   * Can't just switch src on jqImg, because that image is already loaded
   * Firebug doesn't show the updated data- attributes, but they are updated
   */
  this['swapImageOut'] = function(jqImg, path) {
    var that = this;
    // create temporary image container
    var img = $('<img id="dynamic" />');
    // attach listener to catch when the new image has loaded
    img.attr('src', path).one('load', function() {
      // now that it's pre-cached by the temp, apply to original image
      jqImg.attr('src', path);
      // store loaded width and height
      jqImg.data('loaded-width', this.width);
      jqImg.data('loaded-height', this.height);
      if (debug) {
        console.log('image '+jqImg.attr('id')+': swapped out for ('+jqImg.data('loaded-width')+','+jqImg.data('loaded-height')+')');
      }
      that.checkMetric(jqImg);
      // console.log('loaded imageWidth['+this.width+'] imageHeight['+this.height+'] src['+$(this).attr('src')+']');        
    }).each(function() {
      if(this.complete) $(this).load();
    });
    // console.log('swapped path['+path+']');
  };

  /**
   * Read data about the image and update metric display
   * @param  {object} jqImg jQuery object for image
   */
  this['checkMetric'] = function(jqImg) {
    // find the imgmetric if it's set
    var common_parent = jqImg.parents('li');
    var met = common_parent.find('.imgmetric');
    var perc;
    if (met.length) {
      var width_current = jqImg.width(), height_current = jqImg.height();
      var width_native = jqImg.data('native-width'), height_native = jqImg.data('native-height');
      // calculate percentage based on image area, or width
      // perc = Math.round((width_current * height_current) * 100 / (width_native * height_native));
      perc = Math.round(width_current * 100 / width_native);
      if (debug) {
        // show the size of the image that's been loaded into this img container
        met.find('span.width').html(Math.round(jqImg.data('loaded-width')));
        met.find('span.height').html(Math.round(jqImg.data('loaded-height')));
        met.find('span.size').show();
      } else {
        // update with current image width and height
        met.find('span.width').html(Math.round(width_current));
        met.find('span.height').html(Math.round(height_current));
      }
      met.find('span.perc').html(perc+'%');
      // analyse to see if we're over/under the native res
      if (width_current > width_native || height_current > height_native) {
        met.removeClass('super').addClass('sub');
      } else {
        met.removeClass('sub').addClass('super');          
      }
    }
    this.checkMetricPosition(jqImg);
  }

  /**
   * check that the image metric is in the right place
   */
  this['checkMetricPosition'] = function(jqImg) {
    var met = jqImg.parents('li').find('.imgmetric');
    // move the metric to the corner of the image using absolute coords
    met.css( { 'top': jqImg.offset().top, 'left': jqImg.offset().left });
  }

  // ------------------
  // FUNCTIONS: Binding
  // ------------------

  /**
   * process events generated by mouse wheel/trackpad scrolling
   */
  this['bindToScroll'] = function() {
    var that = this;
    $(window).scroll(function(event) {
      that.handler_scrolled(event);
      event.preventDefault();
    });
    $(window).mousewheel(function(event) {
      that.handler_mouseWheeled(event);
      event.preventDefault();
    });
  }

  /**
   * turn header links into clickable buttons
   */
  this['bindToHeaderLinks'] = function() {
    var that = this;
    // fade out header, then setup hover listeners
    $('.header').css('opacity', 0.5).hover(function(event) {
      // animate header open to full screen width
      $(this).stop(true, false).animate( { width: '100%', opacity: 1.0 }, 100);
      event.preventDefault();      
    }, function(event) {
      // leave header up for 2s, then collapse back down
      $(this).stop(true, false).delay(2000).animate( { width: '2.0em', opacity: 0.5 }, 100);
    });
    // horizontal or vertical layout
    $('#flow-x').click(function(event) {
      that.setDirection('x');
      that.checkVisibleImages(false);
      event.preventDefault();
    });
    $('#flow-y').click(function(event) {
      that.setDirection('y');
      that.checkVisibleImages(false);
      event.preventDefault();
    });
    // light or dark theme
    $('#theme-light').click(function(event) {
      $('html').removeClass('theme-dark');
      event.preventDefault();
    });
    $('#theme-dark').click(function(event) {
      $('html').addClass('theme-dark');
      event.preventDefault();
    });
    // 1x, 2x, 4x, or 8x
    $('#flow-1').click(function(event) {
      that.setBreadth(1);
      that.checkVisibleImages(false);
      event.preventDefault();
    });
    $('#flow-2').click(function(event) {
      that.setBreadth(2);
      that.checkVisibleImages(false);
      event.preventDefault();
    });
    $('#flow-4').click(function(event) {
      that.setBreadth(4);
      that.checkVisibleImages(false);
      event.preventDefault();
    });
    $('#flow-8').click(function(event) {
      that.setBreadth(8);
      that.checkVisibleImages(false);
      event.preventDefault();
    });
    
  };

  /**
   * Bind to hotkeys for navigation
   */
  this['bindToHotKeys'] = function() {
    var that = this;
    $(document).keydown(function(event){
      if (debug && false) {
        console.log('keydown event code['+event.which+']');
      }
      switch (event.which) {
        case that.export.KEY_ARROW_LEFT:
        case that.export.KEY_ARROW_UP:
          if (!event.altKey) {
            // advance to previous image
            that.imageAdvanceBy(-1, false);
            event.preventDefault();
          }
          break;
        case that.export.KEY_ARROW_RIGHT:
        case that.export.KEY_TAB:
        case that.export.KEY_ARROW_DOWN:
          // advance to next image
          that.imageAdvanceBy(1, false);
          event.preventDefault();
          break;
        case that.export.KEY_PAGE_UP:
          break;
        case that.export.KEY_PAGE_DOWN:
          break;
        case that.export.KEY_HOME:
          that.imageAdvanceTo(0, false);
          event.preventDefault();
          break;
        case that.export.KEY_END:
          that.imageAdvanceTo(that.getTotalEntries()-1, false);
          event.preventDefault();
          break;
        case that.export.KEY_RETURN:
          that.imageToggleFullscreen();
          event.preventDefault();
          break;
        case that.export.KEY_NUMBER_1:
          that.imageBreadth(1);
          break;
        case that.export.KEY_NUMBER_2:
          that.imageBreadth(2);
          break;
        case that.export.KEY_NUMBER_4:
          that.imageBreadth(4);
          break;
        case that.export.KEY_NUMBER_8:
          that.imageBreadth(8);
          break;
      }
    });
  }

  /**
   * listen for changes to the hash
   * see https://github.com/browserstate/history.js
   */
  this['bindToHashChange'] = function() {
    var that = this;
    // bind to the hash change (not state hashes)
    History.Adapter.bind(window, 'anchorchange', function(event) {
      that.handler_hashChanged(History.getHash());
      event.preventDefault();
    });
  }

  /**
   *  if the image is clicked, redirect to in-page image
   */
  this['bindToImageLinks'] = function() {
    var that = this;
    $('.cell a.image-container').click(function(event) {
      // select image, then toggle
      var seq = $(this).find('img').data('seq');
      // seq changes don't go into history
      that.hashUpdate( { 'seq': seq }, false, false);
      // this is a bit nasty, because it's doing 2 hash updates in quick succession
      that.imageToggleFullscreen();
      event.preventDefault();
    });
  }

  // ------------------
  // FUNCTIONS: getters
  // ------------------

  /**
   * updated loaded-width and loaded-height data attributes
   * @param  {jQuery object} jqImg image to check
   * @param  {jQuery.deferred} deferred async queue
   */
  this['getLoadedResolution'] = function(jqImg, deferred) {
    // update loaded resolution
    var im = new Image();
    im.onload = function() {
      jqImg.data('loaded-width', im.width);
      jqImg.data('loaded-height', im.height);
      im = null;
      // notify promise of resolution
      deferred.resolve(jqImg);
    }
    im.src = jqImg.attr('src');
  }

  /**
   * Get the real flow direction, not just what the class says because the browser might not support all directions
   * (needs flexbox)
   * @return current flow direction
   */
  this['getDirection'] = function() {
    var direction = 'y';
    if ($('html').hasClass('flexbox') && $('html').hasClass('flow-x')) {
      direction = 'x';
    }
    return direction;
  };

  /**
   * Get the flow breadth
   * @return current flow breadth
   */
  this['getBreadth'] = function() {
    var breadth = 2;
    var jq = $('ul.flow');
    if (jq.hasClass('flow-1')) breadth = 1;
    if (jq.hasClass('flow-4')) breadth = 4;
    if (jq.hasClass('flow-8')) breadth = 8;
    return breadth;
  };

  /**
   * @return {float} current size of cell along the major axis
   */
  this['getCellSize'] = function() {
    // get first cell
    var jq = $('ul.flow li:first');
    if (this.getDirection() == 'x') {
      return jq.width();
    } else {
      return jq.height();
    }
  }

  /**
   * @return {int} sequence number of currently selected image
   */
  this['getSeq'] = function() {
    var jq = $('ul.flow li.cell img.bounded.selected')
    // jq.data returns undefined (not 0) if not set, so first-run safe
    return jq.data('seq');
  }

  /**
   * @return {int} total number of entities (max entry seq+1)
   */
  this['getTotalEntries'] = function() {
    var jq = $('ul.flow li.cell img.bounded:last')
    return (parseInt(jq.data('seq'))+1);
  }

  // ------------------
  // FUNCTIONS: setters
  //   all called downstream of events
  // ------------------

  /**
   * set all 'flow' elements to flow in the direction
   * downstream of: EVENT
   */
  this['setDirection'] = function(direction) {
    var invdir = (direction == 'x' ? 'y' : 'x');
    $('.flow').addClass('flow-' + direction).removeClass('flow-' + invdir);
  };

  /**
   * set the width of the screen flow
   * e.g. number of cells vertically if in vertical mode
   * downstream of: EVENT
   */
  this['setBreadth'] = function(breadth) {
    var changed = (this.getBreadth() !== breadth);
    if (!changed) return false;
    // remove all the other breadths
    for (var i=1 ; i <= 8 ; i=i*2) {
      // don't remove the breadth we're setting
      if (i == breadth) {
        continue;
      }
      $('.flow').removeClass('flow-'+i);
    }
    $('.flow').addClass('flow-' + breadth);
    return changed;
  };

  /**
   * @param int sequence number of image to make current
   * downstream of: EVENT
   */
  this['setSeq'] = function(seq) {
    var changed = (this.getSeq() !== seq);
    if (!changed) return false;
    var jqCurrent, position;
    // deselect old image
    $('ul.flow li.cell img.bounded.selected').removeClass('selected');
    // select new image
    jqCurrent = $('#imgseq-'+seq);
    jqCurrent.addClass('selected');
    return changed;
  };

  /** 
   * ensure that a given image lies within the current viewport
   * @param {int} seq image sequence number
   * downstream of: EVENT
   */
  this['setVisibleByScrolling'] = function(seq) {
    var jq = $('#imgseq-'+seq);
      // if we found the cell
    if (jq.length) {
      if (!this.isVisible(jq)) {
        if (this.getDirection() == 'x') {
          // get coordinate of selected image's cell
          position = jq.parents('li.cell').offset();
          this.scrollUpdate(position.left, 0);
        } else {
          position = jq.parents('li.cell').offset();
          this.scrollUpdate(0, position.top);
        }
      } else {
        // manually refresh the visible images
        this.refreshVisible(0);
      }
    }
  }

  /**
   * Loop through all images (synchronously)
   * @return {[type]} [description]
   */
  this['setVisibleAll'] = function() {
    var jqImg, total = this.getTotalEntries();
    for (var seq = 0 ; seq < total ; seq++) {
      jqImg = $('#imgseq-'+seq);
      if (this.isVisible(jqImg)) {
        if (!jqImg.hasClass('visible')) {
          this.setVisibleImage(jqImg, true);
        }        
      }
    }
  }

  /**
   * Loop through those images newly exposed, flagging as visible
   * Protected against case where accidentally called before there are any visible images
   * @param  {int} scrolldir scroll direction
   */
  this['setVisibleNewlyVisible'] = function(scrolldir) {
    // find first invisible image in scroll direction by finding last visible
    var jqImg = $('ul.flow li.cell img.bounded.visible:'+(scrolldir > 0 ? 'last' : 'first'));
    // if there aren't visible images, start at zero
    if (!jqImg.length) {
      return this.setVisibleAll();
    }
    // initial sequence number is the one after the last visible, or before the first visible
    var initialSeq = jqImg.data('seq');
    var seq = this.getNextSeq(jqImg.data('seq'), scrolldir > 0 ? 1 : -1);
    jqImg = $('#imgseq-'+seq);
    if (debug && false) {
      console.log('testing image for visible '+seq);      
    }
    // go through all the images that are now visible
    while (this.isVisible(jqImg) && (seq !== false)) {
      // but it wasn't previously
      if (!jqImg.hasClass('visible')) {
        this.setVisibleImage(jqImg, true);
      }
      // identify next image
      seq = this.getNextSeq(jqImg.data('seq'), scrolldir > 0 ? 1 : -1);
      // check we haven't looped through them all
      if (seq == initialSeq) {
        break;
      } else {
        // prepare to check next image
        jqImg = $('#imgseq-'+seq);
      }
    }
  };

  /**
   * Loop through images flagging those scrolled out of view as not-visible
   * Protected against case where accidentally called before there are any visible images
   * @param  {int} scrolldir scroll direction
   */
  this['setVisibleNewlyHidden'] = function(scrolldir) {
    // find first hidden image in opposite-scroll direction by finding first visible
    var jqImg = $('ul.flow li.cell img.bounded.visible:'+(scrolldir > 0 ? 'first' : 'last'));
    // if there aren't visible images, start at zero
    if (!jqImg.length) {
      return this.setVisibleAll();
    }
    // initial sequence number is the one after the last visible, or before the first visible
    var initialSeq = seq = jqImg.data('seq');
    if (debug && false) {
      console.log('testing image for not-visible '+seq);
    }
    // go through all the images that are now not visible
    while (!this.isVisible(jqImg) && (seq !== false)) {
      // but it was previously
      if (jqImg.hasClass('visible')) {
        this.setVisibleImage(jqImg, false);
      }
      // prepare to check next image (in scrolldir because started at furthest back)
      seq = this.getNextSeq(jqImg.data('seq'), scrolldir > 0 ? 1 : -1);
      jqImg = $('#imgseq-'+seq);
    }
    // check to see if the selected image is now no longer visible
    jqImg = $('ul.flow li.cell img.bounded.selected');
    if (!jqImg.hasClass('visible')) {
      if (debug && false) {
        console.log('previously selected image '+jqImg.data('seq')+' no longer visible');
      }
      // find the next visible one in the scroll direction
      jqImg = $('ul.flow li.cell img.bounded.visible:'+(scrolldir > 0 ? 'first' : 'last'));
      // use hash to select new and deselect old, but numb listener
      that.imageAdvanceTo(jqImg.data('seq'), true);
    }
  };

  /**
   * either flag an image as visible or not visible
   * @param  {jQuery} jqImg image
   * @param  {boolean} vis  true to make visible, false not
   */
  this['setVisibleImage'] = function(jqImg, vis) {
    if (vis) {
      if (debug && false) {
        console.log('making image '+jqImg.data('seq')+' visible');
      }
      // make it visible and swap it out
      jqImg.addClass('visible');
      this.checkImageRes(jqImg);
      that.checkMetricPosition(jqImg);    
    } else {
      if (debug && false) {
        console.log('making image '+seq+' not-visible');
      }
      // make it not-visible
      jqImg.removeClass('visible');
    }
  }

  // --------------------
  // FUNCTIONS: image ops
  // --------------------

  /**
   * advance forward or back by a certain number of images in the sequence
   * @param {int} increment positive to go to next, negative for previous
   */
  this['imageAdvanceBy'] = function(increment, numbListener) {
    // start with the current image
    var seq = this.getSeq();
    if (seq >= 0 && seq <= this.getTotalEntries()) {
      // iterate to find next image
      if ((seq = this.getNextSeq(seq, increment)) !== false) {
        this.imageAdvanceTo(seq, numbListener);
      }
    } else {
      console.log('warning: erroneous seq('+seq+') returned by getseq');
    }
  };

  /**
   * advance to a specific image in the sequence
   * @param {int} image sequence number
   */
  this['imageAdvanceTo'] = function(seq, numbListener) {
    // update using hash change
    this.hashUpdate( { 'seq': seq }, false, numbListener);
  }

  /**
   * switch between the default breadth and fullscreen
   */
  this['imageToggleFullscreen'] = function() {
    var numbListener = false;
    // toggle using hash change
    if (this.getBreadth() == 1) {
      this.hashUpdate( { 'breadth': this.defaultBreadth }, false, numbListener);
    } else {
      this.hashUpdate( { 'breadth': 1 }, false, numbListener);
    }
  }

  // ---------------
  // FUNCTIONS: hash
  // ---------------

  /**
   * convert an object to a hash string
   * @param {object} values as an object
   * @return {string} hash as string (without a # prepend)
   */
  this['hashGenerate'] = function(obj) {
    var hash = '';
    for (var key in obj) {
      if (hash != '') {
        hash += '&';
      }
      hash += key+'='+obj[key];
    }
    return hash;
  }

  /**
   * parse out integers from hash attributes
   * @param  {string} hash string
   * @return {object} hash values as an object
   */
  this['hashParse'] = function(hash) {
    var output = {};
    // look for hash arguments
    if (hash.length > 1) {
      // strip leading #! if set
      var hblen = this.export.HASHBANG.length;
      if (hash.substr(0, hblen) == this.export.HASHBANG) {
        hash = hash.substr(hblen);
      }
      // override defaults if set
      var hashpairs = hash.split('&');
      for (var i=0 ; i<hashpairs.length ; ++i) {
        // var eqpos = hashpairs[i].indexOf('=');
        var components = hashpairs[i].split('=');
        // adding elements to an object using array syntax (unknown name)
        output[components[0]] = parseInt(components[1]);
      }
    }
    return output;
  }

  /**
   * check that the values in this object are valid
   * @param  {object} hash name:value pairs
   * @return {boolean} true if they're ok
   */
  this['hashValidate'] = function(hash) {
    var deleteCount = 0;
    for (var attrname in hash) {
      switch(attrname) {
        case 'seq':
          if (!((hash[attrname] >= 0) && (hash[attrname] < this.getTotalEntries()))) {
            deleteCount++;
            // remove entry from hash
            delete hash[attrname];
          }
          break;
      }
    }
    // true if we haven't deleted/fixed anything
    return (deleteCount == 0);
  }

  // -------------------------
  // FUNCTIONS: event triggers
  // -------------------------

  /** 
   * The numbQueue is used to stop the hashChanged listener from firing for certain hash changes
   */
  this['eventNumbQueue'] = [];

  /**
   * Make a change to the document's hash
   * @param  {object}  options      name:value pairs to go in the hash
   * @param  {boolean} push         true to push a history item
   * @param  {boolean} numbListener true to numb the hashChanged listener to this change
   */
  this['hashUpdate'] = function(options, push, numbListener) {
    var hash = '', fromHash;
    // start with defaults
    var obj = { 'breadth': this.defaultBreadth, 'seq': this.defaultSeq};
    // overwrite with current hash values
    fromHash = this.hashParse(History.getHash());
    this.merge(obj, fromHash);
    // overwrite with options
    this.merge(obj, options);
    // convert to hash string
    hash = this.hashGenerate(obj);
    if (debug && false) {
      console.log(hash);
    }
    // push hash string (options with defaults) on to numb queue if numb
    if (numbListener) {
      this['eventNumbQueue'].push('hash:'+hash);
      if (debug && false) {
        console.log('adding hash('+hash+') on to numbQueue, now len['+this['eventNumbQueue'].length+']');
      }
    }
    // fire event: change the window.location.hash
    if (push) {
      History.pushState({}, null, this.export.HASHBANG+hash);
    } else {
      // -- doesn't always work!
      History.replaceState({}, 'Image', this.export.HASHBANG+hash);
      // have to read it back and check
      if (History.getHash() != this.export.HASHBANG+hash) {
        // -- leaves a messy history trail
        window.location.hash = this.export.HASHBANG+hash;
      }
    }
  }

  /**
   * change the visible portion of the page by moving the scrollbars
   * @param  {int} left distance from left of page in pixels
   * @param  {int} top  distance from top of page in pixels
   * @param  {boolean}  numbListener true to numb the hashChanged listener to this change
   */
  this['scrollUpdate'] = function(left, top, numbListener) {
    if (numbListener) {
      this['eventNumbQueue'].push('scroll:'+'x='+left+'&y='+top);
      if (debug && false) {
        console.log('adding scroll('+'x='+left+'&y='+top+') on to numbQueue, now len['+this['eventNumbQueue'].length+']');
      }
    }
    // fire event: change the scroll position (comes through as single event)
    $(document).scrollLeft(left);
    $(document).scrollTop(top);
  }

  // -------------------------
  // FUNCTIONS: event handlers
  // -------------------------

  /** 
   * @param  {string} key  event description used to index in queue
   * @return {boolean} true if this event should be ignored
   */
  this['handler_numb'] = function(key) {
    var index = this['eventNumbQueue'].indexOf(key);
    if (index != -1) {
      if (debug) {
        console.log('ignoring '+key+' change');
      }
      // remove this hash from the numbQueue
      this['eventNumbQueue'].splice(index, 1);
      return true;
    }
    if (debug) {
      console.log('not ignoring '+key+' change');
    }
    return false;
  }

  /**
   * apply hash state (+current values for those unset) to page
   * downstream of: EVENT hash change
   */
  this['handler_hashChanged'] = function(hash) {
    // first of all find out if we should actually ignore this hash change
    if (this.handler_numb('hash:'+hash)) {
      // ignore this event
    } else {
      // keep track of whether this update could have affected all images and selected images
      var allImagesChanged = false;
      var selectedImageChanged = false;
      // start with defaults
      var obj = { 'breadth': this.defaultBreadth, 'seq': this.defaultSeq};
      // overwrite with current hash values
      fromHash = this.hashParse(hash);
      // check the hash values are valid, fallback to defaults if not
      if (!this.hashValidate(fromHash)) {
        console.log('illegal hash values, falling back to defaults');
      }
      this.merge(obj, fromHash);
      // stage 1: apply [hash] state to DOM
      // breadth changes potentially affect all images
      allImagesChanged |= this.setBreadth(obj.breadth);
      // seq changes at most only affect the image being selected
      selectedImageChanged |= this.setSeq(obj.seq);
      // can't decide about this bit
      // // stage 2: DOM updates trigger async events (e.g. image loads)
      // if (allImagesChanged) {
      //   // check all images are bounded properly, max res etc
      //   this.checkVisibleImages(false);
      // }
      // if (selectedImageChanged) {
      //   var jqImg = $('#imgseq-'+obj.seq);
      //   this.checkMetric(jqImg);
      // }
      // 
      this.setVisibleByScrolling(obj.seq);
    }
  }

  /**
   * process events generated by mouse wheel scrolling
   * downstream of: EVENT mouse wheeled
   */
  this['handler_mouseWheeled'] = function(event) {
    var direction = this.getDirection();
    // active mousewheel reaction is dependent on which direction we're flowing in
    if (direction == 'x') {
      var xpos = $(document).scrollLeft();
      // get current cell size
      var cellsize = this.getCellSize();
      // get current x position, increment and write back, firing scroll event
      this.scrollUpdate(xpos + (0 - event.deltaY) * cellsize, 0, false);
      if (debug && false) {
        console.log('wheel dx[' + event.deltaX + '] dy[' + event.deltaY + '] factor[' + event.deltaFactor + ']');
      }
    }
  }

  /**
   * process events generated by window scrolling
   * downstream of: EVENT scroll
   */
  this['handler_scrolled'] = function(event) {
    var sx = $(document).scrollLeft(), sy = $(document).scrollTop();
    if (this.handler_numb('scroll:'+'x='+sx+'&y='+sy)) {
      // ignore this event
    } else {
      // invert deltas to match scroll wheel
      if (this.scroll_lastX == undefined) {
        event.deltaX = 0 - sx;
        event.deltaY = 0 - sy;
      } else {
        event.deltaX = 0 - (sx - this.scroll_lastX);
        event.deltaY = 0 - (sy - this.scroll_lastY);
      }
      event.deltaFactor = 1;
      // remember scroll coords for next time
      this.scroll_lastX = sx;
      this.scroll_lastY = sy;
      if (debug && false) {
        console.log('scroll dx[' + event.deltaX + '] dy[' + event.deltaY + '] factor[' + event.deltaFactor + ']');
      }
      // see if scroll has made any new images visible
      var scrolldir = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? 0 - event.deltaX : 0 - event.deltaY);
      this.refreshVisible(scrolldir);
    }
  }

  /**
   * refresh the img.visible status on all/some of the images
   * @param  {int} scrolldir direction of scroll (+ve/-ve) or 0 for no scroll
   */
  this['refreshVisible'] = function(scrolldir) {
    if (scrolldir == 0) {
      // if no scroll direction, refresh test all images for visibility
      this.setVisibleAll();
    } else {
      this.setVisibleNewlyVisible(scrolldir);
      this.setVisibleNewlyHidden(scrolldir);
    }
  }

  /**
   * merge into obj1
   * overwrites obj1's values with obj2's and adds obj2's if non existent in obj1
   * @param obj1
   * @param obj2
   */
  this['merge'] = function(obj1, obj2){
    for (var attrname in obj2) {
      obj1[attrname] = obj2[attrname];
    }
  }

  /**
   * @return {bool} True if this image is currently visible in the viewport
   */
  this['isVisible'] = function(jq) {
    // var jqCell = jq.parents('li.cell');
    var jqCell = jq;
    // get coordinate of selected image's cell
    var position = jqCell.offset();
    // if horizontal (flow-x), scroll horizontally
    if (this.getDirection() == 'x') {
      var min = $(document).scrollLeft();
      var max = $(window).width() + $(document).scrollLeft() - jqCell.width();
      if (debug && false) {
        console.log('min['+min+'] max['+max+'] position['+position.left+']');
      }
      return (position.left >= min && position.left <= max);
    } else {
      var min = $(document).scrollTop();
      var max = $(window).height() + $(document).scrollTop() - jqCell.height();
      return (position.top >= min && position.top <= max);
    }
  }

  /**
   * @return {int | bool} next sequence number, or false on failure
   */
  this['getNextSeq'] = function(seq, increment) {
    var startingPointSeq = seq;
    do {
      seq = (seq+increment) % this.getTotalEntries();
      // wrap around
      if (seq < 0 && increment < 0) {
        seq = this.getTotalEntries()-1;
      }
      if ($('#imgseq-'+seq).length) {
        return seq;
      }
    } while (seq != this.startingPointSeq);
    return false;
  }

  // -----------------
  // FUNCTIONS: External API
  // -----------------

  that = this;
  this['export'] = {
    // queue function calls until document ready
    q: [],

    /**
     * execute a function
     * @param  {string} name function name
     * @param  {[type]} obj  function arguments
     */
    'push': function(name, obj) {
      if (this.q == null) {
        // execute function immediately
      } else {
        // push function and call later
        this.q.push({ 'name': name, 'obj': obj });
      }
    },

    /**
     * execute contents of queue
     */
    'flush': function() {
      for (var i=0 ; i<this.q.length ; ++i) {
        // call queued function
        this['api_'+this.q[i].name](this.q[i].obj);
      }
      // disable queue
      this.q = null;
    },

    // ---------
    // CONSTANTS
    // ---------

    KEY_ARROW_LEFT: 37,
    KEY_ARROW_RIGHT: 39,
    KEY_ARROW_UP: 38,
    KEY_ARROW_DOWN: 40,
    KEY_TAB: 9,
    KEY_HOME: 36,
    KEY_END: 35,
    KEY_PAGE_UP: 33,
    KEY_PAGE_DOWN: 34,
    KEY_SHIFT: 16,
    KEY_CTRL: 17,
    KEY_ALT: 18,
    KEY_RETURN: 13,
    KEY_NUMBER_1: 49,
    KEY_NUMBER_2: 50,
    KEY_NUMBER_4: 52,
    KEY_NUMBER_8: 56,
    HASHBANG: '#',

    /**
     * add a button to the header
     * @param  {object} obj arguments
     */
    'api_headerAddButton': function(obj) {
      var output;
      Mustache.parse(obj.template);
      output = Mustache.render(obj.template, obj.view);
      // attach output to header
      $('.header').append(output);
      // allow element to bind its handlers
      obj.callbackBind.call(this, obj);
    },

    /**
     * @return {int} breadth of current view
     */
    'api_getBreadth': function() {
      return that.getBreadth();
    },

    /**
     * @return {int} total number of entries
     */
    'api_getTotalEntries': function() {
      return that.getTotalEntries();
    },

    /**
     * helper function to make testing key presses easier
     */
    'api_triggerKeypress': function(key) {
      var e = jQuery.Event( 'keydown', { which: key } );
      $(document).trigger(e);
    },

    // no comma on last entry
    lastEntry: true
  };

  // call init function then return API object
  this.init();
  return this['export'];

})(jQuery, undefined);