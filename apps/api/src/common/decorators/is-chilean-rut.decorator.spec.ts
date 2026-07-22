import { validate } from 'class-validator';
import { isValidRut, normalizeRut } from '@centro/shared';
import { IsChileanRut } from './is-chilean-rut.decorator';

class RutHolder {
  @IsChileanRut()
  rut!: string;
}

describe('isValidRut / normalizeRut', () => {
  it('acepta un RUT válido con guion', () => {
    expect(isValidRut('12345678-5')).toBe(true);
  });

  it('acepta el mismo RUT con puntos y minúsculas', () => {
    expect(isValidRut('12.345.678-5')).toBe(true);
  });

  it('acepta un dígito verificador K y normaliza a mayúscula', () => {
    // body "00000006": suma módulo 11 da resto 1 ⇒ dígito verificador K.
    expect(isValidRut('00000006-k')).toBe(true);
    expect(normalizeRut('00000006k')).toBe('00000006-K');
  });

  it('rechaza un dígito verificador incorrecto', () => {
    expect(isValidRut('12345678-9')).toBe(false);
  });

  it('rechaza formatos claramente inválidos', () => {
    expect(isValidRut('')).toBe(false);
    expect(isValidRut('no-es-un-rut')).toBe(false);
    expect(isValidRut('123')).toBe(false);
  });
});

describe('IsChileanRut', () => {
  it('pasa la validación de class-validator con un RUT correcto', async () => {
    const holder = new RutHolder();
    holder.rut = '12345678-5';
    const errors = await validate(holder);
    expect(errors).toHaveLength(0);
  });

  it('falla la validación de class-validator con un RUT incorrecto', async () => {
    const holder = new RutHolder();
    holder.rut = '12345678-9';
    const errors = await validate(holder);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isChileanRut');
  });
});
