import { Capability } from 'types/backend';

/**
 * True if `dataset` grants `capability`. Old backend responses carry no `capabilities`
 * field at all; for those, a public dataset is treated as fully open (both PREVIEW and
 * DOWNLOAD) and a private one as closed.
 */
export function hasCapability(dataset: { capabilities?: Capability[]; visibility?: string }, capability: Capability): boolean {
  return dataset.capabilities?.includes(capability) ?? dataset.visibility === 'public';
}
