import { useContext } from 'react'

import { AvailabilityContext } from '../contexts/AvailabilityContext'

const useAvailability = () => {
    const theme = useContext(AvailabilityContext)

    if (theme === undefined) {
        throw new Error(
            'useAvailability must be used within a AvailabilityContext'
        )
    }

    return theme
}

export default useAvailability
