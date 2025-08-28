import { describe, expect, it } from 'vitest'
import { mapMetadataToGeneric } from '../src/schema/map.js'

describe('mapMetadataToGeneric', () => {
  it('maps SeaTable metadata to GenericSchema', () => {
    const meta = {
      base_id: 'baseX',
      tables: [
        {
          _id: 't1',
          name: 'Tasks',
          columns: [
            { key: 'c1', name: 'Title', type: 'text' },
            { key: 'c2', name: 'Done', type: 'checkbox' },
            { key: 'c3', name: 'File', type: 'file' },
            { key: 'c4', name: 'Image', type: 'image' },
          ],
        },
      ],
    }
    const generic = mapMetadataToGeneric(meta)
    expect(generic.base_id).toBe('baseX')
    expect(generic.tables[0].id).toBe('t1')
    expect(generic.tables[0].name).toBe('Tasks')
    const cols = generic.tables[0].columns
    expect(cols.find((c) => c.name === 'Title')?.type).toBe('text')
    expect(cols.find((c) => c.name === 'Done')?.type).toBe('checkbox')
    expect(cols.find((c) => c.name === 'File')?.type).toBe('attachment')
    expect(cols.find((c) => c.name === 'Image')?.type).toBe('attachment')
  })
})
