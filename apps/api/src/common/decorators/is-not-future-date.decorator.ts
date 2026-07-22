import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Valida que una fecha (string ISO 8601) no sea posterior a "ahora".
 * A diferencia de `@MaxDate(new Date())`, que fija el límite al momento en
 * que se carga la clase (una sola vez al iniciar el proceso), esto compara
 * contra la fecha real en el momento de cada validación.
 */
export function IsNotFutureDate(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isNotFutureDate',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') {
            return false;
          }
          const date = new Date(value);
          return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} no puede ser una fecha futura`;
        },
      },
    });
  };
}
