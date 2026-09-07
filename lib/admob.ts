import {
  AdEventType,
  MobileAds,
  RewardedAd,
  RewardedAdEventType,
} from "react-native-google-mobile-ads";

export const AD_EVENT_LOADED = RewardedAdEventType.LOADED;
export const AD_EVENT_EARNED_REWARD = RewardedAdEventType.EARNED_REWARD;
export const AD_EVENT_CLOSED = AdEventType.CLOSED;
export const AD_EVENT_ERROR = AdEventType.ERROR;

export type RewardedAdInstance = {
  load(): void;
  show(): Promise<void>;
  addAdEventListener(type: string, listener: (payload?: unknown) => void): () => void;
};

export function initializeAdMob() {
  return MobileAds().initialize();
}

export function createRewardedAd(adUnitId: string): RewardedAdInstance {
  return RewardedAd.createForAdRequest(adUnitId);
}