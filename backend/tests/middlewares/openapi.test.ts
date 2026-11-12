import { describe, expect, it } from '@jest/globals';
import { mergeFragment } from '../../src/middlewares/openapi';

type Spec = { paths: Record<string, unknown>; components: Record<string, Record<string, unknown>> };

const main = (): Spec => ({
  paths: { '/datasets': { get: {} } },
  components: { responses: { BadRequest: { description: 'Bad request' } }, schemas: { Dataset: { type: 'object' } } },
});

describe('mergeFragment', () => {
  it('adds the fragment paths and components, and points its refs to openapi.yaml at the merged document', () => {
    const spec = main();
    mergeFragment(
      spec,
      {
        paths: { '/runners': { get: { $ref: '../src/openapi.yaml#/components/schemas/Dataset' } } },
        components: { schemas: { Runner: { type: 'object' } } },
      },
      'fragment.yaml',
    );

    expect(spec.paths['/runners']).toEqual({ get: { $ref: '#/components/schemas/Dataset' } });
    expect(spec.components['schemas']?.['Runner']).toEqual({ type: 'object' });
  });

  it("skips a fragment component that only points at openapi.yaml's", () => {
    const spec = main();
    mergeFragment(
      spec,
      { paths: {}, components: { responses: { BadRequest: { $ref: '../src/openapi.yaml#/components/responses/BadRequest' } } } },
      'fragment.yaml',
    );

    expect(spec.components['responses']?.['BadRequest']).toEqual({ description: 'Bad request' });
  });

  it('refuses a path or component that is in both files', () => {
    expect(() => mergeFragment(main(), { paths: { '/datasets': {} } }, 'fragment.yaml')).toThrow(
      'fragment.yaml: /datasets is also in openapi.yaml',
    );
    expect(() => mergeFragment(main(), { paths: {}, components: { schemas: { Dataset: { type: 'string' } } } }, 'fragment.yaml')).toThrow(
      'fragment.yaml: components.schemas.Dataset is also in openapi.yaml',
    );
  });
});
