export interface CatalogRule {
  id: string
  name: string
  bucket: string
  juris: string
  statement: string
  det: string
  params: string
  src: string[]
}

export const CATALOG: CatalogRule[]
