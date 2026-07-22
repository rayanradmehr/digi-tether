import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';

type PlainObject = Record<string, unknown>;

/**
 * Recursively trims leading and trailing whitespace from all string fields
 * in an incoming request body.
 *
 * Applied globally via `createGlobalValidationPipe` `transform` pipeline, or
 * explicitly on individual controller methods.
 *
 * Only modifies `body`-scoped arguments; leaves `param` and `query` unchanged
 * since those are handled by individual param pipes.
 */
@Injectable()
export class TrimStringsPipe implements PipeTransform {
  public transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'body') {
      return value;
    }
    return this.trimValue(value);
  }

  private trimValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (Array.isArray(value)) {
      return value.map((item: unknown) => this.trimValue(item));
    }
    if (typeof value === 'object' && value !== null) {
      const obj = value as PlainObject;
      const result: PlainObject = {};
      for (const key of Object.keys(obj)) {
        result[key] = this.trimValue(obj[key]);
      }
      return result;
    }
    return value;
  }
}
