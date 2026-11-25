import { Button } from './Button'
import { Dialog } from './Dialog'

export function TermsAndConditionsDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose(): void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Términos y Condiciones de Uso"
      description="Última actualización: 16 de noviembre de 2026"
      className="ln-legal-dialog"
      actions={
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="ln-legal-content">
        <p>
          Bienvenido a <strong>Lunumia</strong>. Los presentes Términos y
          Condiciones de Uso (en adelante, los{' '}
          <strong>&quot;Términos&quot;</strong>) regulan el acceso y uso de la
          aplicación móvil, aplicación web progresiva (PWA) y servicios
          relacionados ofrecidos bajo la marca <strong>Lunumia</strong> (en
          adelante, la <strong>&quot;Plataforma&quot;</strong>), operada por{' '}
          <strong>César Emmanuel Santiago Rodríguez</strong> (en adelante, el{' '}
          <strong>&quot;Titular&quot;</strong>), con domicilio de contacto en el{' '}
          <strong>Estado de México, México</strong>, y correo electrónico
          oficial de soporte y asuntos legales{' '}
          <a href="mailto:legal@lunumia.com">legal@lunumia.com</a>.
        </p>
        <p>
          Al crear una cuenta, acceder o utilizar Lunumia, usted (en adelante,
          el <strong>&quot;Usuario&quot;</strong>) acepta quedar obligado
          legalmente por estos Términos. Si no está de acuerdo con alguna de
          estas disposiciones, deberá abstenerse de utilizar la Plataforma.
        </p>

        <hr className="ln-legal-divider" />

        <h3>1. Objeto y Descripción del Servicio</h3>
        <p>
          Lunumia es una herramienta tecnológica gratuita de organización y
          control financiero personal diseñada para ayudar a los Usuarios a
          registrar ingresos, gastos, presupuestos y metas de ahorro.
        </p>
        <p>
          <strong>Exclusión de Asesoría Financiera:</strong> Lunumia es
          exclusivamente una herramienta informativa y de gestión personal. El
          Titular <strong>no es</strong> una institución financiera, entidad
          bancaria, asesor de inversiones ni contador público certificado.
          Ninguna función, métrica, proyección o recomendación generada por la
          Plataforma constituye asesoría financiera, fiscal, legal o de
          inversión profesional. Toda decisión económica tomada por el Usuario
          es bajo su exclusiva responsabilidad.
        </p>

        <h3>2. Elegibilidad y Registro de Cuenta</h3>
        <ul>
          <li>
            <strong>Edad mínima:</strong> Para utilizar Lunumia, el Usuario debe
            tener al menos 18 años de edad o contar con la mayoría de edad legal
            en su jurisdicción y plena capacidad para celebrar contratos.
          </li>
          <li>
            <strong>Veracidad de la información:</strong> El Usuario se
            compromete a proporcionar datos veraces, exactos y actualizados
            durante el registro.
          </li>
          <li>
            <strong>Seguridad de credenciales:</strong> El Usuario es el único
            responsable de resguardar la confidencialidad de su contraseña y de
            toda actividad realizada desde su cuenta. Deberá notificar de
            inmediato al Titular al correo{' '}
            <a href="mailto:legal@lunumia.com">legal@lunumia.com</a> ante
            cualquier uso no autorizado.
          </li>
        </ul>

        <h3>
          3. Funciones de Inteligencia Artificial (IA) y Escaneo de Recibos
        </h3>
        <p>
          Lunumia integra modelos de inteligencia artificial para ofrecer
          funcionalidades como:
        </p>
        <ol>
          <li>
            <strong>Escaneo y digitalización de recibos o tickets</strong>{' '}
            mediante reconocimiento óptico y extracción automatizada de datos.
          </li>
          <li>
            <strong>Resúmenes financieros personalizados</strong> por periodo.
          </li>
          <li>
            <strong>Sugerencias y análisis de ahorro</strong> (habilitadas a
            partir de que el Usuario cumpla con el historial mínimo de uso
            requerido, tal como tres meses de registro continuo).
          </li>
        </ol>
        <p>Respecto a estas herramientas, el Usuario reconoce y acepta que:</p>
        <ul>
          <li>
            <strong>Posibilidad de imprecisiones:</strong> Los sistemas de
            inteligencia artificial y lectura de recibos son probabilísticos y
            pueden cometer errores de interpretación, categorización o cálculo.
            El Usuario es responsable de verificar la exactitud de los montos y
            datos extraídos antes de confiar en ellos.
          </li>
          <li>
            <strong>Procesamiento automatizado:</strong> Para ejecutar estas
            funciones, los datos financieros ingresados y las imágenes de
            recibos podrán ser procesados de forma automatizada mediante
            infraestructuras en la nube y proveedores tecnológicos de IA bajo
            estrictas medidas de seguridad y confidencialidad, conforme a
            nuestro Aviso de Privacidad.
          </li>
        </ul>

        <h3>4. Uso Aceptable y Prohibiciones</h3>
        <p>
          El Usuario se obliga a utilizar Lunumia de forma lícita y ética. Queda
          estrictamente prohibido:
        </p>
        <ul>
          <li>
            Copiar, modificar, descompilar, realizar ingeniería inversa o
            intentar extraer el código fuente de la Plataforma.
          </li>
          <li>
            Utilizar bots, <em>scrapers</em>, scripts automatizados o cualquier
            medio no autorizado para extraer datos o sobrecargar los servidores.
          </li>
          <li>
            Subir imágenes o archivos que contengan virus, <em>malware</em>,
            material ilegal, o información financiera de terceros sin su
            consentimiento.
          </li>
          <li>
            Intentar vulnerar los controles de seguridad o acceso de la
            Plataforma.
          </li>
        </ul>
        <p>
          El incumplimiento de estas reglas facultará al Titular para suspender
          o cancelar de inmediato la cuenta del Usuario.
        </p>

        <h3>5. Propiedad Intelectual</h3>
        <ul>
          <li>
            <strong>Propiedad de Lunumia:</strong> Todo el software, código,
            arquitectura, diseño visual, interfaces, logotipos, marcas, textos y
            algoritmos de Lunumia son propiedad exclusiva del Titular o de sus
            licenciantes, y están protegidos por las leyes nacionales e
            internacionales de derechos de autor y propiedad industrial.
          </li>
          <li>
            <strong>Licencia al Usuario:</strong> Se otorga al Usuario una
            licencia personal, limitada, no exclusiva, revocable e
            intransferible para usar la Plataforma conforme a estos Términos.
          </li>
          <li>
            <strong>Datos del Usuario:</strong> El Usuario conserva la
            titularidad total sobre los datos financieros, registros y
            fotografías de recibos que ingrese en Lunumia. El Usuario otorga al
            Titular una licencia limitada únicamente para alojar, respaldar,
            procesar y mostrar dicha información con el fin de prestar el
            servicio.
          </li>
        </ul>

        <h3>6. Publicidad y Enlaces de Terceros</h3>
        <p>
          Lunumia podrá mostrar anuncios publicitarios proporcionados por redes
          publicitarias de terceros para sostener la gratuidad del servicio. El
          Titular no respalda ni garantiza los productos, servicios o contenidos
          anunciados por terceros. Cualquier relación comercial o contractual
          que el Usuario establezca con un anunciante será exclusivamente entre
          el Usuario y dicho tercero.
        </p>

        <h3>7. Disponibilidad del Servicio y Limitación de Responsabilidad</h3>
        <ul>
          <li>
            <strong>Servicio &quot;Tal cual&quot;:</strong> Lunumia se
            proporciona de forma gratuita &quot;tal cual&quot; y &quot;según
            disponibilidad&quot;. Aunque se realizan esfuerzos razonables para
            mantener la continuidad y sincronización de los datos, no se
            garantiza que la Plataforma esté libre de interrupciones, fallos
            técnicos o errores.
          </li>
          <li>
            <strong>Respaldo de información:</strong> Se recomienda al Usuario
            mantener sus propios respaldos de documentación fiscal o financiera
            crítica (como facturas o recibos originales).
          </li>
          <li>
            <strong>Exclusión de responsabilidad:</strong> En la máxima medida
            permitida por la ley aplicable, el Titular no será responsable por
            daños directos, indirectos, incidentales, pérdida de ganancias,
            pérdida de datos o decisiones financieras tomadas con base en el uso
            de la Plataforma.
          </li>
        </ul>

        <h3>8. Privacidad y Protección de Datos Personales</h3>
        <p>
          El tratamiento de los datos personales y financieros del Usuario se
          rige por nuestro <strong>Aviso de Privacidad</strong>, disponible
          dentro de la Plataforma y en{' '}
          <a
            href="https://lunumia.com/privacy/"
            target="_blank"
            rel="noopener noreferrer"
          >
            https://lunumia.com/privacy/
          </a>
          , el cual forma parte integral de estos Términos.
        </p>

        <h3>9. Modificaciones a los Términos y al Servicio</h3>
        <p>
          El Titular se reserva el derecho de modificar estos Términos
          (incluyendo la futura incorporación de modalidades de pago o
          suscripciones), así como de agregar, cambiar o descontinuar funciones
          de la Plataforma en cualquier momento. En caso de cambios sustanciales
          en los Términos, se notificará al Usuario a través de la Plataforma o
          por correo electrónico con antelación razonable. El uso continuado de
          Lunumia tras la entrada en vigor de las modificaciones constituirá su
          aceptación.
        </p>

        <h3>10. Legislación Aplicable y Jurisdicción</h3>
        <p>
          Para la interpretación, cumplimiento y ejecución de los presentes
          Términos, las partes se someten expresamente a las leyes federales de
          los <strong>Estados Unidos Mexicanos</strong> y a la jurisdicción de
          los tribunales competentes del <strong>Estado de México</strong>,
          renunciando expresamente a cualquier otro fuero que pudiera
          corresponderles por razón de sus domicilios presentes o futuros.
        </p>
      </div>
    </Dialog>
  )
}
