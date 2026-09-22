export const QUEUE_WAIT_MS=12000;
export const VISION_TIMEOUT_MS=15000;
export const CLASSIFY_ATTEMPTS=2;
export const RETRY_DELAY_MS=300;
// Allow worker startup, cache/storage work and message delivery after model work.
export function pageRequestTimeout(settings:{timeoutMs:number;visionEnabled:boolean}):number {
  return QUEUE_WAIT_MS+CLASSIFY_ATTEMPTS*(settings.timeoutMs+(settings.visionEnabled?VISION_TIMEOUT_MS:0))+(CLASSIFY_ATTEMPTS-1)*RETRY_DELAY_MS+5000;
}
