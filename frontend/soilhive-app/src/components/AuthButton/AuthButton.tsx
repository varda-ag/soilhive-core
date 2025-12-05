import { Button } from "components/UI";
import { useAuthContext } from "../../auth/AuthContextProvider";
import UserIcon from '../../assets/icons/small-user-icon.svg?react'

export default function AuthButton() {

    const { isAuthenticated, isLoading, login, logout, authMode } = useAuthContext();

    if (authMode === 'none')
        return null

    if (isLoading)
        return <span>Loading...</span>

    if (isAuthenticated)
        return (
            <Button type={'tertiary'} onClick={logout}>
                <UserIcon />
                Log out
            </Button>
        )

    return (
        <Button type={'tertiary'} onClick={() => login()}>
            <UserIcon />
            Log in
        </Button>
    )

}