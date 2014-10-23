<?php

/**
 * Extra doc
 * ---------
 * When a directory Fileview is requested
 * We create a CachedMetadataFileReader
 *   We append arguments for the thumbnails in that listing 
 *   Its MetadataFileReader reads the directory listing
 *     Then we create a CachedMetadataFileReader for each file
 *     Arguments get passed down too, to ensure that we create the same cachestrings
 *     If it's cached, read the file
 *       Its MetadataFileReader then returns metadata for each file
 *     which is used to setup the CSS properly for each thumbnail
 * @author Alex Stanhope <alex_stanhope@hotmail.com>
 */

namespace Lightenna\StructuredBundle\DependencyInjection;

class CachedMetadataFileReader extends MetadataFileReader {

  protected $cache;
  protected $cachedir;

  public function __construct($filename = null, $con) {
    parent::__construct($filename, $con);
    $this->cachedir = $this->controller->convertRawToInternalFilename($this->settings['mediacache']['path']);
    // create cache directory if it's not already present
    if (!is_dir($this->cachedir)) {
      @mkdir($this->cachedir);
      if (!is_dir($this->cachedir)) {
        // unable to create cache directory, throw nice error
        print('Error: unable to create cache directory ('.$this->cachedir.')');
        exit;
      }
    }
    if (!$this->isDirectory()) {
      $this->stats->cachekey = null;
      if (!is_null($filename)) {
        $this->stats->cachekey = $this->getKey();
      }
    }
  }

  /**
   * called on first instance of cmfr for optional debugging ops
   */
  public function processDebugSettings() {
    if (isset($this->settings['mediacache']['cleareverytime']) && $this->settings['mediacache']['cleareverytime']) {
      // scrub cache directory
      self::scrubDirectoryContents($this->cachedir);
    }
  }

  /**
   * Test to see if we can use the cache
   * @return boolean True if cache is enabled
   */
  public function cacheIsEnabled() {
    if (isset($this->settings['general']['nocache']) || isset($this->args->{'nocache'}) || is_null($this->stats->cachekey)) {
      return false;
    }
    return true;
  }

  public function existsInCache($filename = null) {
    if (is_null($filename)) {
      $filename = $this->stats->file;
    }
    // if the image file exists in the (enabled) cache, return it
    return $this->cacheIsEnabled() && file_exists($filename);
  }

  public function isCached() {
    // if the image file is cached at the requested size, return it
    return !is_null($this->stats->{'cachekey'}) && $this->existsInCache($this->getFilename($this->stats->cachekey));
  }
  
  public function cacheKeyUpdateable() {
    // if the cachekey is set (not a directory) and set with a value (not a null filename)
    return isset($this->stats->{'cachekey'}) && !is_null($this->stats->{'cachekey'});
  }

  /**
   * Store the imgdata in the cache if the cache is enabled
   * @param string $imgdata
   * @return true if written to cache
   */
  public function cache(&$imgdata) {
    if ($this->cacheIsEnabled()) {
      $filename = $this->getFilename($this->stats->cachekey);
      // only cache the file if it's not already in the cache
      if (!$this->existsInCache($filename)) {
        // read metadata from imgdata stream
        $this->readImageMetadata($imgdata);
        // write out file
        file_put_contents($filename, $imgdata);
        // update the metadata object with image's current stats
        $this->metadata->filterStats($this->stats);
        if ($this->fileCanHoldMetadata()) {
          $this->metadata->write($filename);
        } else {
          // serialize to text file
          file_put_contents($this->getMetaFilename($filename), $this->metadata->serialize());
        }
        return true;
      }
    }
    return false;
  }

  /**
   * @param  string $filename Filename of image file
   * @return string filename of metadata file
   */
  private function getMetaFilename($filename) {
    return self::stripExtension($filename) . '.meta';
  }

  /**
   * @return true if this type of file can hold IPTC metadata in it
   */
  public function fileCanHoldMetadata() {
    switch ($this->stats->ext) {
      case 'jpeg' :
      case 'jpg' :
      default :
        return true;
      case 'gif' :
        return false;
    }
  }
  
  /**
   * For now this is based on name-only
   * @todo incorporate file modified date into hash
   * @return string A cache key based on the file's metadata
   */

  public function getKey() {
    $cachestring = $this->getFullname();
    $argstring = self::flattenKeyArgs($this->args);
    if ($argstring != '') {
      $cachestring .= ARG_SEPARATOR . $argstring;
    }
    // var_dump($cachestring);
    $key = self::hash($cachestring) . '.' . 'dat';
    return $key;
  }

  /**
   * Returns a simple filename for the current file, or its cached alias if key set
   * @param  string $key cache key, false not to use, true to use pre-existing
   * @return string full path filename of this key'd asset
   */

  public function getFilename($key = false) {
    if ($key === true && isset($this->stats->cachekey)) {
      $key = $this->stats->cachekey;
    }
    // if we don't have a cachekey, are reading a directory, or pulling a directory from a zip
    if ($key === false || $this->isDirectory() || ($this->inZip() && $this->zip_part_leaf == null)) {
      // just return the file part
      $fullname = parent::getFilename();
    } else {
      $fullname = $this->cachedir . '/' . $key; 
    }
    return $fullname;
  }

  /**
   * Return the full name of this file, or file within zip, or entry within directory
   * @param $obj directory entry object or null/blank to get our fullname 
   * @return Full filename reconstituted from directory entry
   */
  
  public function getFullname($obj = null) {
    if (is_null($obj)) {
      $obj = $this->stats;
    }
    return parent::getFullname($obj);
  }

  /**
   * Get the contents of a file, ideally from the cache
   * Can't save to cache here because the image hasn't been filtered (resized/cropped etc.)
   * @see \Lightenna\StructuredBundle\DependencyInjection\FileReader::get()
   */
  public function get() {
    if ($this->isCached()) {
      // redirect to use file from cache, but don't change cache key
      $this->rewrite($this->getFilename($this->stats->cachekey), false);
    }
    $imgdata = parent::get();
    return $imgdata;
  }

  /**
   * Get the contents of a file only if it's in the cache
   * @return string Contents of file, or FALSE on failure
   */
  public function getOnlyIfCached() {
    if ($this->isCached()) {
      // not calling parent::get() because want to read cache
      $filename = $this->getFilename($this->stats->cachekey);
      $imgdata = file_get_contents($filename);
      if ($this->fileCanHoldMetadata()) {
        // pull metadata manually for cached image
        $this->readImageMetadata($imgdata);
      } else {
        // pull from cached .meta file
        $metaname = $this->getMetaFilename($filename);
        if (file_exists($metaname)) {
          $this->stats->{'meta'} = unserialize(file_get_contents($metaname));
        }
      }
      return $imgdata;
    }
    else {
      return false;
    }
  }
  
  /**
   * @return path to cache directory
   */
  public function getCachePath() {
    return $this->cachedir;
  }
  
  /**
   * Rewrite the current file's path
   * @todo may need to tweak for things in zips
   */

  public function rewrite($newname, $updateCacheKey = true) {
    parent::rewrite($newname);
    // only update cache key if we're not rewriting from the cache
    if ($updateCacheKey) {
      $this->stats->cachekey = $this->getKey();    
    }
    return $newname;
  }

  /**
   * Set the arguments for this file reader
   * @param object $args
   */
  public function setArgs($args) {
    parent::setArgs($args);
    if ($this->cacheKeyUpdateable()) {
      // update cachekey after messing with args
      $this->stats->cachekey = $this->getKey();
    }
  }
  
  /**
   * Add arguments to our argument array
   * Arguments influence the cachestring in the CachedMetadataFileReader
   * @param object $args
   */
  public function injectArgs($args) {
    parent::injectArgs($args);
    if ($this->cacheKeyUpdateable()) {
      // update cachekey after messing with args
      $this->stats->cachekey = $this->getKey();
    }
  }
  
  /**
   * Generate hash in a standard way
   * @param string $key
   * @return string MD5 checksum
   */
  static function hash($key) {
    return md5($key);
  }

  /**
   * Create a string to uniquely identify these image arguments
   * @param object $args URL arguments
   * @return string arguments as a string
   */

  static function flattenKeyArgs($args) {
    $output = '';
    // if there are no args, they flatten to an empty string
    if (is_null($args))
      return '';
    // only certain args should be used in the cache key
    $keys = array(
      'maxwidth',
      'maxheight',
      'maxlongest',
      'maxshortest',
    );
    foreach ($keys as $key) {
      if (isset($args->{$key})) {
        $output .= $key . '=' . $args->{$key};
      }
    }
    return $output;
  }

  static function scrubDirectoryContents($dir) {
    // get directory listing
    $listing = scandir($dir);
    foreach ($listing as $k => $v) {
      // ignore directory references or empty file names
      if ($v == '.' || $v == '..' || $v == '') {
        unset($listing[$k]);
        continue;
      }
      // delete the file
      unlink($dir.DIR_SEPARATOR.$v);
    }
  }
}
