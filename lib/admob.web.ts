export const AD_EVENT_LOADED = "rewarded_loaded";
export const AD_EVENT_EARNED_REWARD = "rewarded_earned_reward";
export const AD_EVENT_CLOSED = "closed";
export const AD_EVENT_ERROR = "error";

export type RewardedAdInstance = {
  load(): void;
  show(): Promise<void>;
  addAdEventListener(type: string, listener: (payload?: unknown) => void): () => void;
};

export function initializeAdMob() {
  return Promise.resolve();
}

export function createRewardedAd(_adUnitId: string): null {
  return null;
}