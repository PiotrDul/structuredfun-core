/**
 * StructuredFun javascript
 * QUnit test harness
 */
(function($, sfun, undefined) {

  // ---------
  // CONSTANTS
  // ---------

  // ---------
  // FUNCTIONS
  // ---------

  var init = function() {
    var obj = {
      'context': this,
      'callback': bindToTemplate,
      'view': {
        'title': 'Test'
      },
      'template': getTemplate()
    };
    // once script is loaded and executes, push header button async
    sfun.push('headerAddButton', obj);
  };

  var getTemplate = function() {
    var str = '<p><a href="#" id="header-test-single">{{ title }}</a></p>';
    return str;
  }

  var bindToTemplate = function(obj) {
    $('#header-test-single').click(getClickHandler());
  }

  var getClickHandler = function() {
    return(function(event) {
      // write QUnit harness into page
      var qs = '<div id="qunit"></div><div id="qunit-fixture"></div>';
      $('body').prepend(qs);
      // pull in QUnit library (triggers scroll:x=0&y=0)
      $.getScript("/chrome/vendor/qunit/qunit-1.14.0.min.js").done(function() {
        // execute tests
        tests();
      });
      event.preventDefault();
    });
  }

  // -----
  // TESTS
  // -----

  /**
   * execute tests
   */
  var tests = function() {
    QUnit.init();
    var endTest = function() {
      window.location.hash = '#!';
    }

    test( 'reres of first page of images', function() {
      QUnit.stop();
      sfun.api_triggerKeypress(sfun.KEY_HOME).done(function() {
        equal( $('ul.flow .selectablecell.selected').data('seq'), 0, 'Home selected #0 image' );
        $('ul.flow .selectablecell.visible .reresable').each(function() {
          var imw = $(this).width(), imh = $(this).height();
          var jqEnt = $(this).parents('li');
          var lodw = $(this).data('loaded-width'), lodh = $(this).data('loaded-height');
          ok( imw <= lodw && imh <= lodh, 'image #'+jqEnt.data('seq')+' ('+imw+'x'+imh+') loaded('+lodw+'x'+lodh+')');
        });
        endTest();
        QUnit.start();
      });
    });

    test( 'reres of last page of images', function() {
      QUnit.stop();
      sfun.api_triggerKeypress(sfun.KEY_END).done(function() {
        equal( $('ul.flow .selectablecell.selected').data('seq'), (sfun.api_getTotalEntries()-1), 'End selected last image' );
        $('ul.flow .selectablecell.visible .reresable').each(function() {
          var imw = $(this).width(), imh = $(this).height();
          var jqEnt = $(this).parents('li');
          var lodw = $(this).data('loaded-width'), lodh = $(this).data('loaded-height');
          ok( imw <= lodw && imh <= lodh, 'image #'+jqEnt.data('seq')+' ('+imw+'x'+imh+') loaded('+lodw+'x'+lodh+')');
        });
        QUnit.start();
        endTest();
      });
    });

    QUnit.start();
  }

  // call init function
  init();

})(jQuery, window.sfun, undefined);