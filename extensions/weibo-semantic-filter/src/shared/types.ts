export type DisplayState = 'visible' | 'dimmed' | 'collapsed';
export type PostType = 'original' | 'repost' | 'reply' | 'unknown';
export interface WeiboPost {
  postId: string;
  authorId: string;
  authorName: string;
  text: string;
  repostText: string;
  visibleContext: string;
  canonicalUrl: string;
  postType: PostType;
  hasMedia: boolean;
  imageUrls?:string[]; imagesComplete?:boolean; hasVideo?:boolean;
  hasLinkCard: boolean;
  isTextTruncated: boolean;
  contextCompleteness: 'complete' | 'unknown';
  elementFingerprint: string;
}
export const DECISIONS = ['sports_content', 'substantive_text', 'social_interaction', 'new_substantive_information', 'interaction_evidence_sufficient', 'life_philosophy', 'poetry_or_sentiment', 'concrete_business_economic_information', 'investment_philosophy', 'noise_evidence_sufficient'] as const;
export type DecisionKey = typeof DECISIONS[number];
export interface Decision {
  state: DisplayState;
  reason: string;
  source: 'protected' | 'local' | 'model' | 'unavailable';
  applyInShadow?: boolean;
  scores?: Partial<Record<DecisionKey, number>>;
  model?: string;
  latencyMs?: number;
  cached?: boolean;
  policyVersion?: string;
  schemaVersion?: string;
}
