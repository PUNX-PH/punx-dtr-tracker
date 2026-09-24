/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            // Phones narrower than ~480px still need a break below
            // Tailwind's 640px `sm` for the tightest controls.
            screens: {
                xs: '480px',
            },
        },
    },
    plugins: [],
}
