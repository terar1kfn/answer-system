// Preserve the public evidence summary shape; ranking is relative, not a
// calibrated probability or confirmation of an actual root cause.
import {rankHypotheses} from './diagnostic-hypotheses.mjs';
export function summarizeEvidence(state){return rankHypotheses(state);}
