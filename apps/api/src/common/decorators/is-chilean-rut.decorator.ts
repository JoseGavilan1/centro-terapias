import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { isValidRut } from '@centro/shared';

/** Valida un RUT chileno (dígito verificador módulo 11) usando la misma lógica que el frontend. */
export function IsChileanRut(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isChileanRut',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidRut(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} no es un RUT chileno válido`;
        },
      },
    });
  };
}
