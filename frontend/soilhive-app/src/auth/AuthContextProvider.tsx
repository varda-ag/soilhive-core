import React, { useState } from "react";
import type { AuthConfig } from "./AuthConfig";


export function AuthContextProvider({children}: {children:React.ReactNode}) {
    const [authConfig, setAuthConfig] = useState<AuthConfig>()
    return (
        <div>
            ok
        </div>
    )
}