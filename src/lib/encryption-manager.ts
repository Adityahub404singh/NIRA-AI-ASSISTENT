/**
 * EncryptionManager handles AES-256 encryption for sensitive data.
 * In a real production app, keys would be managed via a secure KMS.
 * For this demo, we use a derived key from a local secret.
 */

export class EncryptionManager {
  private static ALGORITHM = 'AES-GCM';
  private static KEY_NAME = 'nira_master_key';

  private static async getMasterKey(): Promise<CryptoKey> {
    const storedKey = localStorage.getItem(this.KEY_NAME);
    if (storedKey) {
      const keyData = new Uint8Array(JSON.parse(storedKey));
      return await crypto.subtle.importKey(
        'raw',
        keyData,
        this.ALGORITHM,
        true,
        ['encrypt', 'decrypt']
      );
    }

    // Generate a new key if none exists
    const key = await crypto.subtle.generateKey(
      { name: this.ALGORITHM, length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const exported = await crypto.subtle.exportKey('raw', key);
    localStorage.setItem(this.KEY_NAME, JSON.stringify(Array.from(new Uint8Array(exported))));
    return key;
  }

  static async encrypt(data: string): Promise<string> {
    const key = await this.getMasterKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: this.ALGORITHM, iv },
      key,
      encoded
    );

    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);
    
    return btoa(String.fromCharCode(...result));
  }

  static async decrypt(encryptedData: string): Promise<string> {
    try {
      const key = await this.getMasterKey();
      const combined = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
      
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);
      
      const decrypted = await crypto.subtle.decrypt(
        { name: this.ALGORITHM, iv },
        key,
        data
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.error("Decryption failed", e);
      return "";
    }
  }
}
