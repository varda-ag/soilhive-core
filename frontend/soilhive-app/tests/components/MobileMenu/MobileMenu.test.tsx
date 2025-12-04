import { render, screen } from "@testing-library/react"
import MobileMenu from "components/MobileMenu/MobileMenu"

jest.mock('react-router', () => ({
    NavLink: ({ to, children }: any) => (
        <a data-testid="mock-router-navlink" href={to}>
            {children}
        </a>
    )
}))

describe('Mobile menu', () => {
    it('should render nav link from menu entries config', () => {

        // Arrange
        const menuEntries = [
            {
                name: 'a',
                route: '/a'
            },
            {
                name: 'b',
                route: '/b'
            }
        ]

        const setIsMenuOpen = () => {}

        // Act
        const {container} = render(<MobileMenu menuEntries={menuEntries} setIsMenuOpen={setIsMenuOpen}/>)

        // Assert
        const navLinks = screen.getAllByTestId('mock-router-navlink')
        expect(navLinks.length).toBe(menuEntries.length)
        expect(container).toMatchSnapshot()
     })
})