// Mirrors server/index.mjs CAN — the UI hides what the server would refuse anyway.
const PERMS = { owner: ['*'], manager: ['state:write', 'students:write', 'mail:send', 'mail:config', 'mail:inbox', 'telegram', 'bulletin', 'messages', 'audit'], teacher: ['mail:send', 'messages'] };
export const canDo = (me, perm) => !!me && (PERMS[me.role]?.includes('*') || PERMS[me.role]?.includes(perm));
