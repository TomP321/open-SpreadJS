import type { BuiltinFunction } from '../evaluate.js';
import { ImageExValue } from '../values.js';

/** `=IMAGE(src, [alt], [sizing], [height], [width])` — picture in a cell. */
export const IMAGE_FUNCTIONS: BuiltinFunction[] = [{
  name: 'IMAGE', min: 1, max: 10,
  evaluate(args) {
    return new ImageExValue({
      src: args.text(0),
      alt: args.count > 1 ? args.text(1) : '',
      sizing: args.count > 2 ? args.integer(2) : 0,
      height: args.count > 3 ? args.number(3) : 0,
      width: args.count > 4 ? args.number(4) : 0,
    });
  },
}];
