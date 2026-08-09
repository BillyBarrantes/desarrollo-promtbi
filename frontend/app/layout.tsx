import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ViPromt - Diseño Arquitectónico CAD",
  description: "Interfaz conversacional para generar, iterar y exportar layouts arquitectónicos CAD 2D/3D mediante lenguaje natural.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <a href="#main-content" className="skip-link">
          Saltar al contenido principal
        </a>
        {children}
      </body>
    </html>
  );
}
