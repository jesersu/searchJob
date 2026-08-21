import { describe, expect, it } from 'vitest'
import { contentKey, isSameOffer } from '@domain/Identity'
import { aJob } from './fixtures'

describe('contentKey', () => {
  // Found live: BairesDev posts to Torre and LinkedIn, so the same offer
  // reached the ranking twice with different scores. URL dedupe cannot see it.
  it('gives the same key to one offer published on two boards', () => {
    const torre = aJob({ source: 'torre', url: 'https://torre.ai/post/abc', company: 'BairesDev', title: 'Mobile QA Engineer - Remote Work | REF#301108' })
    const linkedin = aJob({ source: 'linkedin', url: 'https://www.linkedin.com/jobs/view/1', company: 'BairesDev', title: 'Mobile QA Engineer - Remote Work | REF#301108' })
    expect(contentKey(torre)).toBe(contentKey(linkedin))
  })

  it('matches on the reference code even when the rest of the title differs', () => {
    const a = aJob({ url: 'https://a.com/1', company: 'BairesDev', title: 'Mobile QA Engineer - Remote Work | REF#301108' })
    const b = aJob({ url: 'https://b.com/2', company: 'BairesDev', title: 'QA Mobile (Remoto) REF #301108' })
    expect(contentKey(a)).toBe(contentKey(b))
  })

  it('ignores case, accents and punctuation', () => {
    const a = aJob({ url: 'https://a.com/1', company: 'BairesDev', title: 'Desarrollador Móvil Kotlin - Trabajo Remoto' })
    const b = aJob({ url: 'https://b.com/2', company: 'bairesdev', title: 'desarrollador movil kotlin  trabajo remoto' })
    expect(contentKey(a)).toBe(contentKey(b))
  })

  it('keeps different companies apart even with identical titles', () => {
    const a = aJob({ url: 'https://a.com/1', company: 'BairesDev', title: 'Mobile Engineer' })
    const b = aJob({ url: 'https://b.com/2', company: 'Globant', title: 'Mobile Engineer' })
    expect(contentKey(a)).not.toBe(contentKey(b))
  })

  it('keeps different roles at the same company apart', () => {
    const a = aJob({ url: 'https://a.com/1', company: 'BairesDev', title: 'Senior iOS Engineer' })
    const b = aJob({ url: 'https://b.com/2', company: 'BairesDev', title: 'Senior Android Engineer' })
    expect(contentKey(a)).not.toBe(contentKey(b))
  })

  // An unnamed company is not evidence of sameness: two unrelated postings
  // would collapse into one. Fall back to URL identity.
  it('never collapses offers whose company is unknown', () => {
    const a = aJob({ url: 'https://a.com/1', company: 'unknown', title: 'Mobile Engineer' })
    const b = aJob({ url: 'https://b.com/2', company: 'unknown', title: 'Mobile Engineer' })
    expect(contentKey(a)).not.toBe(contentKey(b))
  })

  it('treats reference codes from different companies as different offers', () => {
    const a = aJob({ url: 'https://a.com/1', company: 'BairesDev', title: 'QA REF#301108' })
    const b = aJob({ url: 'https://b.com/2', company: 'Globant', title: 'QA REF#301108' })
    expect(contentKey(a)).not.toBe(contentKey(b))
  })
})

describe('isSameOffer', () => {
  it('is true for the same offer on two boards', () => {
    const a = aJob({ url: 'https://a.com/1', company: 'Kraken', title: 'Staff React Native Engineer' })
    const b = aJob({ url: 'https://b.com/2', company: 'Kraken', title: 'Staff React Native Engineer' })
    expect(isSameOffer(a, b)).toBe(true)
  })

  it('is false for unrelated offers', () => {
    const a = aJob({ url: 'https://a.com/1', company: 'Kraken', title: 'Staff React Native Engineer' })
    const b = aJob({ url: 'https://b.com/2', company: 'Kraken', title: 'Staff iOS Engineer' })
    expect(isSameOffer(a, b)).toBe(false)
  })
})
