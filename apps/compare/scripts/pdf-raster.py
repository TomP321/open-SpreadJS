#!/usr/bin/env python3
"""Rasterise every page of a PDF at a fixed dpi and describe it (task 16 oracle).

Prints one JSON object per line: page geometry, raster size and the images the
page places. Uses PyMuPDF, a local dev tool only: nothing here ships.

Usage: pdf-raster.py input.pdf outputDir dpi
"""
import json
import os
import sys

import fitz


def main() -> int:
    pdf_path, out_dir, dpi = sys.argv[1], sys.argv[2], int(float(sys.argv[3]))
    os.makedirs(out_dir, exist_ok=True)
    document = fitz.open(pdf_path)
    if document.needs_pass:
        print(json.dumps({'error': 'encrypted'}), file=sys.stderr)
        return 2
    print(json.dumps({'kind': 'document', 'format': document.metadata.get('format'),
                      'pages': document.page_count, 'metadata': document.metadata}))
    for index in range(document.page_count):
        page = document.load_page(index)
        rect = page.rect
        pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=False)
        target = os.path.join(out_dir, f'page-{index}.png')
        pix.save(target)
        images = []
        for info in page.get_image_info(xrefs=True):
            box = info['bbox']
            images.append({
                'xref': info.get('xref'),
                'width': info.get('width'),
                'height': info.get('height'),
                'bbox': [round(value, 3) for value in box],
            })
        print(json.dumps({
            'kind': 'page',
            'page': index,
            'mediaBox': [round(rect.width, 4), round(rect.height, 4)],
            'raster': [pix.width, pix.height],
            'images': images,
            'textChars': len(page.get_text().strip()),
        }))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
