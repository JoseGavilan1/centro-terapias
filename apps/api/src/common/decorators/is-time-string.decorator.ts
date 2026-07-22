import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { isValidTimeString } from '@centro/shared';

/** Valida formato "HH:MM" 24 horas (p. ej. "09:30"), usado por TherapySlot/Appointment. */
export function IsTimeString(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isTimeString',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidTimeString(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} debe tener formato HH:MM (24 horas)`;
        },
      },
    });
  };
}
