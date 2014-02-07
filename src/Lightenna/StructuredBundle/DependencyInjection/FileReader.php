<?php

namespace Lightenna\StructuredBundle\DependencyInjection;

class FileReader {

  // parts of filename
  var $zip_part = null;
  var $file_part = null;
  var $zip_part_path = null;
  var $zip_part_leaf = null;
  var $file_part_path = null;
  var $file_part_leaf = null;

  // file listing if this is a folder
  var $listing = null;

  /**
   * @param string $filename
   * Filenames for files must have dots (e.g. fish.jpg) 
   */

  public function __construct($filename) {
    // end before any arguments at the end of the URL
    if (($end = strpos($filename, ARG_SEPARATOR)) === false) {
      $end = strlen($filename);
    }
    // parse filename for zip marker
    if (($zip_pos = self::detectZip($filename)) !== false) {
      $this->file_part = substr($filename, 0, $zip_pos);
      // store zip_part without preceding slash
      $this->zip_part = ltrim(substr($filename, $zip_pos, $end - $zip_pos), DIR_SEPARATOR);
      list($this->zip_part_path, $this->zip_part_leaf) = $this->splitPathLeaf($this->zip_part);
    }
    else {
      $this->file_part = substr($filename, 0, $end);
      list($this->file_part_path, $this->file_part_leaf) = $this->splitPathLeaf($this->file_part);
    }
  }

  /**
   * Test to see if the file entity exists
   */

  public function isExisting() {
    if ($this->inZip()) {
      // get the zip's listing, then scan for file entry
      $this->getListing();
      // if we're not looking for anything inside the zip, [the zip] does exist
      if ($this->zip_part == '') {
        return true;
      }
      // if we're not looking for a file in the zip, assume directory exists
      if ($this->zip_part_leaf == '') {
        return true;
      }
      foreach ($this->listing as $k => $item) {
        // we've already stripped the zip_part_path from the listing
        if ($this->zip_part_leaf == $item->name) {
          return true;
        }
      }
      return false;
    }
    else {
      // use filesystem to detect presence
      return file_exists($this->file_part);
    }
  }

  /**
   * Test to see if the file entity is a directory
   * @return boolean True if directory, false if file, null if not present
   */

  public function isDirectory() {
    if ($this->inZip()) {
      // check it exists
      if (!$this->isExisting()) {
        return null;
      }
      // if it exists, use ultra-simple file test
      if ($this->zip_part_leaf === null) {
        return true;
      }
      return false;
    }
    else {
      // use filesystem to detect type
      return is_dir($this->file_part);
    }
  }

  /**
   * Return a directory listing
   * Crops and strips the zip_part from the listing items
   * @return array Processed listing
   */

  public function getListing() {
    // return listing if we've already generated it
    if (is_array($this->listing)) {
      return $this->listing;
    }
    // get listing either using file system directly, or parsing zip
    if ($this->inZip()) {
      $zip = zip_open($this->file_part);
      $listing = array();
      if ($zip) {
        while ($zip_entry = zip_read($zip)) {
          $listing[] = zip_entry_name($zip_entry);
        }
        zip_close($zip);
      }
      // if zip_part_path is set and has characters
      if (($this->zip_part_path !== null) && ($len = strlen($this->zip_part_path)) > 0) {
        foreach ($listing as $k => $item) {
          // crop zip entries based on directory path (zip_part_path)
          if (!(substr($item, 0, $len) === $this->zip_part_path)) {
            unset($listing[$k]);
          }
          // for each valid entry, remove the zip_part_path and slash
          else {
            $remains = substr($item, $len + 1);
            if ($remains == false) {
              // dump entry if there's nothing left after stripping
              unset($listing[$k]);
            }
            else {
              $listing[$k] = $remains;
            }
          }
        }
      }
    }
    else {
      // if it's a directory, scan it
      if (is_dir($this->file_part)) {
        $listing = scandir($this->file_part);
      }
      // if it's a file, make it up
      else {
        $listing = array(
          $this->file_part_leaf,
        );
      }
    }
    foreach ($listing as $k => $v) {
      if ($v == '.' || $v == '..') {
        unset($listing[$k]);
        continue;
      }
      // create an object (stdClass is outside of namespace)
      $obj = new \stdClass();
      $obj->{'name'} = $v;
      // if listing just a file
      if ($this->file_part_leaf !== null) {
        $obj->{'path'} = $this->file_part_path;
        $obj->{'file'} = $this->file_part . DIR_SEPARATOR . $obj->{'name'};
      }
      // if listing a directory/zip
      else if ($this->file_part !== null) {
        $obj->{'path'} = $this->file_part;
        $obj->{'file'} = $this->file_part;
      }
      // assume it's a generic file
      $obj->{'type'} = 'genfile';
      $obj->{'hidden'} = false;
      if (is_dir($this->file_part . DIR_SEPARATOR . $v)) {
        $obj->{'type'} = 'directory';
      }
      // replace this entry in the array with the object we've just made
      $listing[$k] = $obj;
    }
    // store locally and return
    $this->listing = $listing;
    return $listing;
  }

  /**
   * @return File entry for first item in listing (if directory) or only item (file)
   */
  public function getStats() {
    if ($this->listing === null) {
      $this->getListing();
    }
    return reset($this->listing);
  }
  
  /**
   * @return string Contents of file
   */
  public function get() {
    if ($this->inZip()) {
      $zip = new \ZipArchive;
      $zip->open($this->file_part);
      if ($zip) {
        $imgdata = $zip->getFromName($this->zip_part);
      }
      $zip->close();
      return $imgdata;
    }
    else {
      return file_get_contents($this->stats->{'file'});
    }
  }
  
  /**
   * ----------------
   * HELPER functions
   * ----------------
   */

  /**
   * get file extension from a filename
   * @param $name full path of file
   * @return string the extension
   */

  static function getExtension($name) {
    // find end of filename section (pre-args)
    $end = strpos($name, ARG_SEPARATOR);
    // if no args, use full length of string
    if ($end === false) {
      $end = strlen($name);
    }
    // find position of last .
    $pos = strrpos($name, '.');
    // if not found
    if ($pos === false) {
      return false;
    }
    $len = $end - $pos - 1;
    // strip trailing / if it came from a URL
    if ($name[$pos + 1 + $len - 1] == DIR_SEPARATOR) {
      $len--;
    }
    // pull out extension
    $ext = substr($name, $pos + 1, $len);
    return $ext;
  }

  /**
   * Detect if a file component is an archive 
   */

  static function detectZip($comp) {
    $zip_pos = strpos($comp, '.' . ZIP_EXTMATCH);
    if ($zip_pos !== false) {
      $zip_pos += strlen(ZIP_EXTMATCH) + 1;
    }
    return $zip_pos;
  }

  /**
   * @return boolean True if the target file is a zip or is in a zip
   */

  public function inZip() {
    return ($this->zip_part !== null);
  }

  /**
   * Split a filename into leaf and path
   * @param string $fullstr Full input filename
   * @return array(string, string) Path and leaf
   */

  public function splitPathLeaf($fullstr) {
    $path = $leaf = null;
    // detect if the zip_part has a file bit, detect the last dot (filename)
    if (($dot_pos = strrpos($fullstr, '.')) !== false) {
      // detect if the zip_part has a directory path, find preceding slash
      if (($slash_pos = strrpos(substr($fullstr, 0, $dot_pos), DIR_SEPARATOR)) !== false) {
        // if so split into path and leaf
        $path = substr($fullstr, 0, $slash_pos);
        $leaf = substr($fullstr, $slash_pos + 1);
      }
      else {
        // treat whole thing as leaf
        $leaf = $fullstr;
      }
    }
    else {
      // treat the whole thing as a path
      $path = $fullstr;
    }
    return array(
      $path,
      $leaf
    );
  }
}
