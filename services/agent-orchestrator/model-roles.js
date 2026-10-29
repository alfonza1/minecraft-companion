export function requestRole(text){
  const message=text.toLowerCase().trim().replace(/^(?:(?:hey|yo)[, ]+)?(?:(?:can|could|would) you |please |i want you to |i need you to )/,'');
  return /^(?:(?:let's|lets|we should|we need to)\s+)?(?:get|gather|collect|mine|chop|craft|build|construct|hunt|cook|farm|tend|explore|scout|bring|fetch|follow|prepare|restock|rescue|find|go)\b/.test(message)?'work':'conversation';
}
