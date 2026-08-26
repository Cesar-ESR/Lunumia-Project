import lunumiaSymbolUrl from '../../../brand/lunumia-symbol-1024x1024.png'

export function LunumiaBrandSymbol() {
  return (
    <img
      className="ln-brand-mark"
      src={lunumiaSymbolUrl}
      alt=""
      aria-hidden="true"
      width={36}
      height={36}
      draggable={false}
    />
  )
}
