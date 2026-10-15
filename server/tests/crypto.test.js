const { encrypt, decrypt, CURRENT_VERSION } = require('../src/services/crypto');

describe('Field-Level AES-256-GCM Encryption Service', () => {
  it('should encrypt and decrypt sensitive strings correctly', () => {
    const sensitiveName = 'Eleanor Vance';
    const encrypted = encrypt(sensitiveName);

    expect(encrypted).toBeDefined();
    expect(encrypted).not.toEqual(sensitiveName);
    expect(encrypted.startsWith(`enc:${CURRENT_VERSION}:`)).toBe(true);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toEqual(sensitiveName);
  });

  it('should encrypt medical conditions with unique IVs', () => {
    const surgeryType = 'Total Knee Arthroplasty';
    const enc1 = encrypt(surgeryType);
    const enc2 = encrypt(surgeryType);

    // IV must be random per field; two encryptions of the same string must differ
    expect(enc1).not.toEqual(enc2);
    expect(decrypt(enc1)).toEqual(surgeryType);
    expect(decrypt(enc2)).toEqual(surgeryType);
  });

  it('should handle contact information (phone, email)', () => {
    const phone = '+919876543210';
    const email = 'caregiver.family@example.com';

    const encPhone = encrypt(phone);
    const encEmail = encrypt(email);

    expect(decrypt(encPhone)).toEqual(phone);
    expect(decrypt(encEmail)).toEqual(email);
  });

  it('should fail gracefully when ciphertext or authentication tag is tampered with', () => {
    const original = 'Secret Prescription Details';
    const encrypted = encrypt(original);

    // Tamper with ciphertext
    const parts = encrypted.split(':');
    parts[4] = parts[4].replace(/a/g, 'b'); // Tamper ciphertext bytes
    const tampered = parts.join(':');

    const result = decrypt(tampered);
    expect(result).toContain('Decryption Error');
  });

  it('should gracefully pass through null, undefined, or empty values', () => {
    expect(encrypt(null)).toBeNull();
    expect(encrypt(undefined)).toBeUndefined();
    expect(encrypt('')).toEqual('');
    expect(decrypt(null)).toBeNull();
    expect(decrypt(undefined)).toBeUndefined();
    expect(decrypt('')).toEqual('');
  });
});
