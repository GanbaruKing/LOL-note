import type { KnowledgeBook } from './contracts'
import { object, ValidationError } from './validation'

export const emptyKnowledgeBook = (): KnowledgeBook => ({ chapters: [], articles: [] })
export function parseKnowledgeBook(input: unknown): KnowledgeBook {
  const fail = (): never => {
    throw new ValidationError('ノートブックの形式または文字数が正しくありません。')
  }
  const root = object(input)
  if (!Array.isArray(root.chapters) || !Array.isArray(root.articles)) return fail()
  if (root.chapters.length > 100 || root.articles.length > 500) return fail()
  const ids = new Set<string>()
  const id = (value: unknown): string => {
    if (
      typeof value !== 'string' ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(value) ||
      ids.has(value) ||
      ['all', 'favorites', 'unfiled', 'new'].includes(value)
    )
      return fail()
    ids.add(value)
    return value
  }
  const title = (value: unknown): string => {
    if (typeof value !== 'string' || !value.trim() || value.length > 100) return fail()
    return value
  }
  const chapters = root.chapters.map((v) => {
    const c = object(v)
    return { id: id(c.id), title: title(c.title) }
  })
  const chapterIds = new Set(chapters.map((c) => c.id))
  let size = 0
  const articles = root.articles.map((v) => {
    const a = object(v)
    if (a.chapterId !== null && (typeof a.chapterId !== 'string' || !chapterIds.has(a.chapterId)))
      return fail()
    if (typeof a.body !== 'string' || a.body.length > 50000 || (size += a.body.length) > 2000000)
      return fail()
    if (
      typeof a.favorite !== 'boolean' ||
      typeof a.updatedAt !== 'string' ||
      a.updatedAt.length > 40 ||
      !Number.isFinite(Date.parse(a.updatedAt))
    )
      return fail()
    return {
      id: id(a.id),
      chapterId: a.chapterId as string | null,
      title: title(a.title),
      body: a.body,
      favorite: a.favorite,
      updatedAt: a.updatedAt,
    }
  })
  return { chapters, articles }
}
