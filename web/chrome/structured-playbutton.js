/**
 * StructuredFun javascript
 * playbutton: a play-button slideshow
 */
(function ($, sfun, undefined) {

    // ---------
    // CONSTANTS
    // ---------

    var debug = true;
    var $document = $(document);
    var $html = $('html');
    var $button = null;
    var view = {
        'title': 'Play',
        'title_playing': 'Pause',
    };
    var slide_duration = 5 * 1000;

    // -----
    // STATE
    // -----

    var playing = false;
    var change_interval = null;

    // ---------
    // FUNCTIONS
    // ---------

    var init = function () {
        var obj = {
            'context': this,
            'key': 'playbutton',
            'receiverRegistered': play_receiverRegistered,
            'receiverImageClicked': play_receiverImageClicked,
            'receiverKeyPressed': play_receiverKeyPressed,
            'view': view,
            'template': _getTemplate(),
        };
        // not sure of init order, so push async
        sfun.push('headerAddButton', obj);
    };

    /**
     * called by sfun when ready
     */
    var play_receiverRegistered = function () {
        $button = $('#header-playbutton');
        // bind to header button
        $button.click(_getClickHandler());
    };

    /**
     * process a click on an image
     * downstream of: EVENT image click, HANDLER image click
     * @param {object} event raw DOM event
     * @param {object} $ent jQuery object
     * @param {string} selector (type.class) for the click target
     */
    var play_receiverImageClicked = function (event, $ent, selector) {
        if (playing) {
            _pause();
        }
    };

    /**
     * process events generated by key presses
     * downstream of: EVENT key pressed, HANDLER key pressed
     * @return {object} jQuery deferred
     */
    var play_receiverKeyPressed = function (event, eventContext) {
        // allow spacebar to toggle play state
        switch (event.which) {
            case sfun.KEY_SPACE:
                if (playing) {
                    _pause();
                } else {
                    _play();
                }
                event.preventDefault();
                break;
        }
    };

    //
    // FUNCTIONS: Helpers
    // begin _
    //

    var _getTemplate = function () {
        var str = '<li><a href="#" id="header-playbutton">{{ title }}</a></li>';
        return str;
    };

    var _getClickHandler = function () {
        return (function (event) {
            if (playing) {
                _pause();
            } else {
                _play();
            }
            event.preventDefault();
        });
    };

    var _play = function () {
        // flag as playing
        playing = true;
        $html.addClass('playing');
        $button.html(view['title_playing']);
        // setup change interval
        change_interval = setInterval(_getIntervalHandler(), slide_duration);
    };

    var _pause = function () {
        // flag as paused
        playing = false;
        $html.removeClass('playing');
        $button.html(view['title']);
        // cancel change interval
        clearInterval(change_interval);
    };

    var _getIntervalHandler = function () {
        return (function () {
            // advance to next image
            sfun.api_imageAdvanceBy(1);
        });
    };

    // call init function
    init();

})(jQuery, window.sfun, undefined);
