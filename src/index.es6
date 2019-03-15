import TextToPhonemes from './reciter/reciter.es6';
import {SamSpeak, SamProcess} from './sam/sam.es6';

function SamJs (options) {
  const opts = options || {};

  const convert = this.convert = (text) => {
    let input = TextToPhonemes(text);
    if (!input) {
      if (process.env.DEBUG_SAM === true) {
        throw new Error(`phonetic input: "${text}" could not be converted`);
      }
      throw new Error();
    }

    if (process.env.DEBUG_SAM === true) {
      console.log('phonetic data: "%s"', input);
    }

    return input;
  };

  this.speak = (text, phonetic) => {
    if (process.env.DEBUG_SAM === true) {
      console.log('text input: ', text);
    }

    let input;

    if (!(phonetic || opts.phonetic)) {
      input = convert(text);
    } else {
      input = text.toUpperCase();
    }

    return SamSpeak(input, opts);
  };
}

export {SamSpeak, SamProcess, TextToPhonemes};

export default SamJs;
