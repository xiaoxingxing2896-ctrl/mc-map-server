// 内联 bcryptjs（Apache-2.0，见 vendor/bcrypt-LICENSE）。
// 1) UMD 全局对象由脚本修正为 globalThis（ESM 下 this 为 undefined）
// 2) bcryptjs 的 WebCrypto 分支读取 self.crypto：Node ESM 无 self，注入别名
import './bcrypt.js';
if (typeof self === 'undefined') globalThis.self = globalThis;
export default globalThis.dcodeIO.bcrypt;