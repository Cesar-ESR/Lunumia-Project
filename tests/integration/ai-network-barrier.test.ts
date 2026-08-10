describe('barrera de red para pruebas IA', () => {
  it('falla inmediatamente ante fetch no configurado explícitamente', async () => {
    await expect(fetch('https://example.invalid/never')).rejects.toThrow(
      'Unexpected real network request in test',
    )
  })
})
