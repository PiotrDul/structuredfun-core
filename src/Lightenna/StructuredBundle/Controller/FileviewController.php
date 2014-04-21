<?php

namespace Lightenna\StructuredBundle\Controller;
use Symfony\Bundle\FrameworkBundle\Controller\Controller;
use Lightenna\StructuredBundle\DependencyInjection\CachedMetadataFileReader;

class FileviewController extends ViewController {

  public function indexAction($rawname, $format = 'html') {
    // convert rawname to urlname and filename
    $filename = $this->convertRawToFilename($rawname);
    $name = self::convertRawToUrl($rawname);
    // create a file reader object to get directory/zip/directory-nested-in-zip listing
    $this->mfr = new CachedMetadataFileReader($filename, $this);
    $this->mfr->injectShares($name);
    if ($this->mfr->isExisting()) {
      if ($this->mfr->isDirectory()) {
        $dirlisting = $this->mfr->getListing();
// START HERE
// print_r($dirlisting);
// exit;
        return $this
          ->render('LightennaStructuredBundle:Fileview:directory.html.twig',
            array(
              'dirname' => $name,
              'direction' => 'x',
              'celltype' => 'pc',
              'linkpath' => rtrim($name, DIR_SEPARATOR) . DIR_SEPARATOR,
              'argsbase' => ARG_SEPARATOR . 'thumb=true&',
              'argsdefault' => 'maxlongest=200&',
              'dirlisting' => $dirlisting
            ));
      } else {
        // process file
        return $this->render('LightennaStructuredBundle:Fileview:file.html.twig', array(
            'filename' => $filename,
        ));
      }
    } else {
      // implied else
      return $this->render('LightennaStructuredBundle:Fileview:file_not_found.html.twig');
    }
  }

}
