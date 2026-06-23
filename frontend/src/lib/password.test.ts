import { describe, it, expect } from "vitest";
import { validatePassword, generatePassword, PASSWORD_MIN_LEN } from "./password";

describe("validatePassword", () => {
  it("aceita senha forte", () => {
    expect(validatePassword("Kf7!mze2Qx#p")).toBeNull();
  });

  it("rejeita curta demais", () => {
    expect(validatePassword("Ab1!xyz")).not.toBeNull();
  });

  it("exige cada classe de caractere", () => {
    expect(validatePassword("kf7!mze2qx#p")).not.toBeNull(); // sem maiúscula
    expect(validatePassword("KF7!MZE2QX#P")).not.toBeNull(); // sem minúscula
    expect(validatePassword("Kfa!mzeQxx#p")).not.toBeNull(); // sem número
    expect(validatePassword("Kf7mze2Qx0pa")).not.toBeNull(); // sem símbolo
  });

  it("rejeita senha longa demais", () => {
    expect(validatePassword("Aa1!" + "z".repeat(80))).not.toBeNull();
  });
});

describe("generatePassword", () => {
  it("gera senhas que sempre passam na política", () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword();
      expect(pw.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LEN);
      expect(validatePassword(pw)).toBeNull();
    }
  });

  it("gera senhas diferentes a cada chamada", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
