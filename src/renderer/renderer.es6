import {
  tab48426,
  sampleTable,
  sinus
} from './tables.es6';

import {BREAK, END} from '../common/constants.es6'

import SetMouthThroat from './set-mouth-throat.es6'
import CreateTransitions from './create-transitions.es6';
import CreateFrames from './create-frames.es6';
import CreateOutputBuffer from './output-buffer.es6';

/** ASSIGN PITCH CONTOUR
 *
 * This subtracts the F1 frequency from the pitch to create a
 * pitch contour. Without this, the output would be at a single
 * pitch level (monotone).
 *
 * @param {Uint8Array} pitches
 * @param {Uint8Array} frequency1
 *
 */
function AssignPitchContour (pitches, frequency1) {
  for(let i = 0; i < pitches.length; i++) {
    // subtract half the frequency of the formant 1.
    // this adds variety to the voice
    pitches[i] -= (frequency1[i] >> 1);
  }
}

/**
 * RESCALE AMPLITUDE
 *
 * Rescale volume from a linear scale to decibels.
 */
function RescaleAmplitude (amplitude) {
  const amplitudeRescale = [
    0x00, 0x01, 0x02, 0x02, 0x02, 0x03, 0x03, 0x04,
    0x04, 0x05, 0x06, 0x08, 0x09, 0x0B, 0x0D, 0x0F,
    0x00  //17 elements?
  ];
  for(let i = amplitude[0].length - 1; i >= 0; i--) {
    amplitude[0][i] = amplitudeRescale[amplitude[0][i]];
    amplitude[1][i] = amplitudeRescale[amplitude[1][i]];
    amplitude[2][i] = amplitudeRescale[amplitude[2][i]];
  }
}
/**
 * @param {Array} phonemes
 * @param {Number} [pitch]
 * @param {Number} [mouth]
 * @param {Number} [throat]
 * @param {Number} [speed]
 * @param {Boolean} [singmode]
 *
 * @return Uint8Array
 */
export default function Renderer(phonemes, pitch, mouth, throat, speed, singmode) {
  pitch = (pitch === undefined) ? 64 : pitch & 0xFF;
  mouth = (mouth === undefined) ? 128 : mouth & 0xFF;
  throat = (throat === undefined) ? 128 : throat & 0xFF;
  speed = (speed || 72) & 0xFF;
  singmode = singmode || false;

  // Every frame is 20ms long.
  const Output = new CreateOutputBuffer(
    441 // = (22050/50)
    * phonemes.reduce((pre, v) => pre + (v[1] * 20), 0) / 50 // Combined phoneme length in ms.
    * speed | 0 // multiplied by speed.
  );

  const freqdata = SetMouthThroat(mouth, throat);

  // Main render loop.
  let srcpos  = 0; // Position in source
  // FIXME: should be tuple buffer as well.
  let tuples = [];
  while(1) {
    let A = phonemes[srcpos];
    if (A[0]) {
      if (A[0] === END) {
        Render(tuples);
        return Output.get();
      }
      if (A[0] === BREAK) {
        Render(tuples);
        tuples = [];
      } else {
        tuples.push(A);
      }
    }
    ++srcpos;
  }

  /**
   * RENDER THE PHONEMES IN THE LIST
   *
   * The phoneme list is converted into sound through the steps:
   *
   * 1. Copy each phoneme <length> number of times into the frames list,
   *    where each frame represents 10 milliseconds of sound.
   *
   * 2. Determine the transitions lengths between phonemes, and linearly
   *    interpolate the values across the frames.
   *
   * 3. Offset the pitches by the fundamental frequency.
   *
   * 4. Render the each frame.
   *
   * @param {Array} tuples
   */
  function Render (tuples) {
    if (tuples.length === 0) {
      return; //exit if no data
    }

    const [pitches, frequency, amplitude, sampledConsonantFlag] = CreateFrames(
      pitch,
      tuples,
      freqdata
    );

    let t = CreateTransitions(
      pitches,
      frequency,
      amplitude,
      tuples
    );

    if (!singmode) {
      AssignPitchContour(pitches, frequency[0]);
    }
    RescaleAmplitude(amplitude);

    if (process.env.DEBUG_SAM === true) {
      PrintOutput(pitches, frequency, amplitude, sampledConsonantFlag);
    }
    if (process.env.NODE_ENV === 'karma-test') {
      // Karma run, store data for karma retrieval.
      Renderer.karmaOutput = {
        sampledConsonantFlag: sampledConsonantFlag,
        amplitude1: amplitude[0],
        frequency1: frequency[0],
        amplitude2: amplitude[1],
        frequency2: frequency[1],
        amplitude3: amplitude[2],
        frequency3: frequency[2],
        pitches: pitches,
        freq1data: freqdata[0],
        freq2data: freqdata[1],
        freq3data: freqdata[2],
      };
    }

    ProcessFrames(t, speed, frequency, pitches, amplitude, sampledConsonantFlag);
  }

  /**
   * PROCESS THE FRAMES
   *
   * In traditional vocal synthesis, the glottal pulse drives filters, which
   * are attenuated to the frequencies of the formants.
   *
   * SAM generates these formants directly with sin and rectangular waves.
   * To simulate them being driven by the glottal pulse, the waveforms are
   * reset at the beginning of each glottal pulse.
   */
  function ProcessFrames(frameCount, speed, frequency, pitches, amplitude, sampledConsonantFlag) {
    const CombineGlottalAndFormants = (phase1, phase2, phase3, Y) => {
      // Rectangle table consisting of:
      //   0-128 = 0x90
      // 128-255 = 0x70

      // Remove multtable, replace with logical equivalent.
      // Multtable stored the result of a 8-bit signed multiply of the upper nibble of sin/rect (interpreted as signed)
      // and the amplitude lower nibble (interpreted as unsigned), then divided by two.
      // On the 6510 this made sense, but in modern processors it's way faster and cleaner to simply do the multiply.
      function char(x) { return (x & 0x7F) - (x & 0x80); }
      // simulate the glottal pulse and formants
      let ary = []
      let /* unsigned int */ p1 = phase1 * 256; // Fixed point integers because we need to divide later on
      let /* unsigned int */ p2 = phase2 * 256;
      let /* unsigned int */ p3 = phase3 * 256;
      let k;
      for (k=0; k<5; k++) {
        let /* signed char */ sp1 = char(sinus[0xff & (p1>>8)]);
        let /* signed char */ sp2 = char(sinus[0xff & (p2>>8)]);
        let /* signed char */ rp3 = char(0xff & (((p3>>8)<129) ? 0x90 : 0x70));
        let /* signed int */ sin1 = sp1 * (/* (unsigned char) */ amplitude[0][Y] & 0x0F);
        let /* signed int */ sin2 = sp2 * (/* (unsigned char) */ amplitude[1][Y] & 0x0F);
        let /* signed int */ rect = rp3 * (/* (unsigned char) */ amplitude[2][Y] & 0x0F);
        let /* signed int */ mux = sin1 + sin2 + rect;
        mux /= 32;
        mux += 128; // Go from signed to unsigned amplitude
        ary[k] = mux |0;
        p1 += frequency[0][Y] * 256 / 4; // Compromise, this becomes a shift and works well
        p2 += frequency[1][Y] * 256 / 4;
        p3 += frequency[2][Y] * 256 / 4;
      }
      Output.ary(0, ary);
    };

    const RenderSample = (mem66, consonantFlag, mem49) => {
      const RenderVoicedSample = (hi, off, phase1) => {
        hi = hi & 0xFFFF; // unsigned short
        off = off & 0xFF; // unsigned char
        phase1 = phase1 & 0xFF; // unsigned char
        do {
          let sample = sampleTable[hi+off];
          let bit = 8;
          do {
            if ((sample & 128) !== 0) {
              Output(3, 26);
            } else {
              Output(4, 6);
            }
            sample <<= 1;
          } while(--bit !== 0);
          off++;
        } while (((++phase1) & 0xFF) !== 0);

        return off;
      };

      const RenderUnvoicedSample = (hi, off, mem53) => {
        hi = hi & 0xFFFF; // unsigned short
        off = off & 0xFF; // unsigned char
        mem53 = mem53 & 0xFF; // unsigned char
        do {
          let bit = 8;
          let sample = sampleTable[hi+off];
          do {
            if ((sample & 128) !== 0) {
              Output(2, 5);
            }
            else {
              Output(1, mem53);
            }
            sample <<= 1;
          } while (--bit !== 0);
        } while (((++off) & 0xFF) !== 0);
      };

      // mem49 == current phoneme's index - unsigned char

      // mask low three bits and subtract 1 get value to
      // convert 0 bits on unvoiced samples.
      let hibyte = (consonantFlag & 7) - 1;

      // determine which offset to use from table { 0x18, 0x1A, 0x17, 0x17, 0x17 }
      // T, S, Z                0          0x18
      // CH, J, SH, ZH          1          0x1A
      // P, F*, V, TH, DH       2          0x17
      // /H                     3          0x17
      // /X                     4          0x17

      let hi = hibyte * 256; // unsigned short
      // voiced sample?
      let pitch = consonantFlag & 248; // unsigned char
      if(pitch === 0) {
        // voiced phoneme: Z*, ZH, V*, DH
        pitch = pitches[mem49 & 0xFF] >> 4;
        return RenderVoicedSample(hi, mem66, pitch ^ 255);
      }
      RenderUnvoicedSample(hi, pitch ^ 255, tab48426[hibyte]);
      return mem66;
    };

    let speedcounter = 72;
    let phase1 = 0;
    let phase2 = 0;
    let phase3 = 0;
    let mem66 = 0;
    let pos = 0;
    let glottal_pulse = pitches[0];
    let mem38 = glottal_pulse * .75 |0;

    while(frameCount) {
      let flags = sampledConsonantFlag[pos];

      // unvoiced sampled phoneme?
      if ((flags & 248) !== 0) {
        mem66 = RenderSample(mem66, flags, pos);
        // skip ahead two in the phoneme buffer
        pos += 2;
        frameCount -= 2;
        speedcounter = speed;
      } else {
        CombineGlottalAndFormants(phase1, phase2, phase3, pos);

        speedcounter--;
        if (speedcounter === 0) {
          pos++; //go to next amplitude
          // decrement the frame count
          frameCount--;
          if(frameCount === 0) {
            return;
          }
          speedcounter = speed;
        }

        glottal_pulse--;

        if(glottal_pulse !== 0) {
          // not finished with a glottal pulse

          mem38--;
          // within the first 75% of the glottal pulse?
          // is the count non-zero and the sampled flag is zero?
          if((mem38 !== 0) || (flags === 0)) {
            // reset the phase of the formants to match the pulse
            // TODO: we should have a switch to disable this, it causes a pretty nice voice without the masking!
            phase1 = phase1 + frequency[0][pos] & 0xFF;
            phase2 = phase2 + frequency[1][pos] & 0xFF;
            phase3 = phase3 + frequency[2][pos] & 0xFF;
            continue;
          }

          // voiced sampled phonemes interleave the sample with the
          // glottal pulse. The sample flag is non-zero, so render
          // the sample for the phoneme.
          mem66 = RenderSample(mem66, flags, pos);
        }
      }

      glottal_pulse = pitches[pos];
      mem38 = glottal_pulse * .75 |0;

      // reset the formant wave generators to keep them in
      // sync with the glottal pulse
      phase1 = 0;
      phase2 = 0;
      phase3 = 0;
    }
  }
}

function PrintOutput(pitches, frequency, amplitude, sampledConsonantFlag) {
  function pad(num) {
    let s = '00000' + num;
    return s.substr(s.length - 5);
  }
  console.log('===========================================');
  console.log('Final data for speech output:');
  console.log(' flags ampl1 freq1 ampl2 freq2 ampl3 freq3 pitch');
  console.log('------------------------------------------------');
  for (let i=0;i<sampledConsonantFlag.length;i++) {
    console.log(
      ' %s %s %s %s %s %s %s %s',
      pad(sampledConsonantFlag[i]),
      pad(amplitude[0][i]),
      pad(frequency[0][i]),
      pad(amplitude[1][i]),
      pad(frequency[1][i]),
      pad(amplitude[2][i]),
      pad(frequency[2][i]),
      pad(pitches[i])
    );
    i++;
  }
  console.log('===========================================');
}
