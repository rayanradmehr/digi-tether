// Re-exports the canonical filter that already lives in common/filters.
// CoreModule wires this filter globally so consumers import from @core.
export { GlobalHttpExceptionFilter } from '@common/filters/global-http-exception.filter';
