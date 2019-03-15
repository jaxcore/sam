import {PlayBuffer, RenderBuffer} from '../util/player.es6';

import Parser from '../parser/parser.es6';
import Renderer from '../renderer/renderer.es6';

/**
 * Process the input and return the audiobuffer.
 *
 * @param {String} input
 *
 * @param {object}  [options]
 * @param {Boolean} [options.phonetic] Default false.
 * @param {Boolean} [options.singmode] Default false.
 * @param {Boolean} [options.debug]    Default false.
 * @param {Number}  [options.pitch]    Default 64.
 * @param {Number}  [options.speed]    Default 72.
 * @param {Number}  [options.mouth]    Default 128.
 * @param {Number}  [options.throat]   Default 128.
 *
 * @return {Uint8Array|Boolean}
 */
export function SamSpeak (input, options) {
  const buffer = SamProcess(input, options);
  if (false === buffer) {
    return false;
  }
  const audio = new Float32Array(buffer.length);
  for(let i=0; i < buffer.length; i++) {
    audio[i] = (buffer[i] - 128) / 256;
  }

  // Now push buffer to wave player.
  return PlayBuffer(audio);
}

/**
 * Process the input and return the audiobuffer.
 *
 * @param {String} input
 *
 * @param {object}  [options]
 * @param {Boolean} [options.phonetic] Default false.
 * @param {Boolean} [options.singmode] Default false.
 * @param {Boolean} [options.debug]    Default false.
 * @param {Number}  [options.pitch]    Default 64.
 * @param {Number}  [options.speed]    Default 72.
 * @param {Number}  [options.mouth]    Default 128.
 * @param {Number}  [options.throat]   Default 128.
 *
 * @return {Uint8Array|Boolean}
 */
export function SamWave (input, options) {
  const buffer = SamProcess(input, options);
  if (false === buffer) {
    return false;
  }
  RenderBuffer(buffer);
}

/**
 * Process the input and return the audiobuffer.
 *
 * @param {String} input
 *
 * @param {object}  [options]
 * @param {Boolean} [options.phonetic] Default false.
 * @param {Boolean} [options.singmode] Default false.
 * @param {Boolean} [options.debug]    Default false.
 * @param {Number}  [options.pitch]    Default 64.
 * @param {Number}  [options.speed]    Default 72.
 * @param {Number}  [options.mouth]    Default 128.
 * @param {Number}  [options.throat]   Default 128.
 *
 * @return {Uint8Array|Boolean}
 */
export function SamProcess (input, options) {
  const parsed = Parser(input);
  if (false === parsed) {
    return false;
  }

  return Renderer(parsed, options.pitch, options.mouth, options.throat, options.speed, options.singmode);
}

/**
 *
 * @param {object}  [options]
 * @param {Boolean} [options.phonetic] Default false.
 * @param {Boolean} [options.singmode] Default false.
 * @param {Boolean} [options.debug]    Default false.
 * @param {Number}  [options.pitch]    Default 64.
 * @param {Number}  [options.speed]    Default 72.
 * @param {Number}  [options.mouth]    Default 128.
 * @param {Number}  [options.throat]   Default 128.
 *
 * @returns {Function}
 * @constructor
 */
export default function Sam (options) {
  this.speak = (_input) => {
    SamSpeak(_input, options);
  };

  this.wave = (_input) => {
    SamWave(_input, options);
  };
}
