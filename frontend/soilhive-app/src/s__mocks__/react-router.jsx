const moduleMock = jest.createMockFromModule('react-router')

const Link = (props) => {
    const { children, to, ...rest } = props
    return (
        <a href={to} {...rest}>
            {children}
        </a>
    )
}

const NavLink = (props) => {
    const { children, to, className, ...rest } = props

    const classNameResult =
        typeof className === 'function'
            ? className({ isActive: to === moduleMock.__currentLocation })
            : className

    return (
        <a href={to} className={classNameResult} {...rest}>
            {children}
        </a>
    )
}

const Outlet = () => <div>Outlet frame for content from children pages</div>

const __navigate = jest.fn()
const __searchParams = { get: jest.fn() }
const useLocation = () => ({ pathname: moduleMock.__currentLocation })
const useNavigate = () => __navigate
const useSearchParams = () => [__searchParams]
const useParams = jest.fn()

moduleMock.__currentLocation = '/page-1'
moduleMock.__navigate = __navigate
moduleMock.__searchParams = __searchParams
moduleMock.__resetCurrentLocation = () =>
    (moduleMock.__currentLocation = '/page-1')
moduleMock.__setCurrentLocation = (location) =>
    (moduleMock.__currentLocation = location)
moduleMock.Link = Link
moduleMock.NavLink = NavLink
moduleMock.Outlet = Outlet
moduleMock.useLocation = useLocation
moduleMock.useNavigate = useNavigate
moduleMock.useSearchParams = useSearchParams
moduleMock.useParams = useParams

module.exports = moduleMock
