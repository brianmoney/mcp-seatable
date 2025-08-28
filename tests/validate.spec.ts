import { describe, it, expect } from 'vitest'
import { validateRowsAgainstSchema } from '../src/schema/validate.js'
import type { GenericSchema } from '../src/schema/generic.js'

const schema: GenericSchema = {
  base_id: 'base1',
  tables: [
    {
      id: 'tbl1',
      name: 'Tasks',
      columns: [
        { id: 'col1', name: 'Title', type: 'text' },
        { id: 'col2', name: 'Done', type: 'checkbox' },
      ],
    },
  ],
}

describe('validateRowsAgainstSchema', () => {
  it('passes when all columns are known', () => {
    const rows = [{ Title: 'A', Done: true }]
    const res = validateRowsAgainstSchema(schema, 'Tasks', rows)
    expect(res.unknownColumns).toEqual([])
  })

  it('throws on unknown columns by default', () => {
    const rows = [{ Title: 'A', Extra: 1 }]
    expect(() => validateRowsAgainstSchema(schema, 'Tasks', rows)).toThrowError()
  })

  it('returns unknowns when allowCreateColumns=true', () => {
    const rows = [{ Title: 'A', Extra: 1 }]
    const res = validateRowsAgainstSchema(schema, 'Tasks', rows, { allowCreateColumns: true })
    expect(res.unknownColumns).toEqual(['Extra'])
  })

  it('throws on unknown table', () => {
    const rows = [{}]
    expect(() => validateRowsAgainstSchema(schema, 'Nope', rows)).toThrowError('ERR_SCHEMA_UNKNOWN_TABLE')
  })
})
