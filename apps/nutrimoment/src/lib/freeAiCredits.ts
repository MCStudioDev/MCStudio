export const FREE_LIFETIME_AI_CREDITS = 10;

export function buildFreeAiCreditsExhaustedNotice(nextAction: string) {
  return `Your ${FREE_LIFETIME_AI_CREDITS} free AI credits are used. ${nextAction}`;
}
