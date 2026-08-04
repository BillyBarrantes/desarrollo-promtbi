import os
import ezdxf

def generar_plantilla():
    # Crear un nuevo documento DXF
    doc = ezdxf.new(dxfversion='R2010')
    
    # --- BLOQUE: CAMA (1.40 x 2.00) ---
    cama = doc.blocks.new(name='BLOQUE_CAMA')
    cama.add_lwpolyline([(-0.7, -1.0), (0.7, -1.0), (0.7, 1.0), (-0.7, 1.0)], close=True) # Contorno
    cama.add_lwpolyline([(-0.7, 0.4), (0.7, 0.4)]) # Doblez de la sábana
    cama.add_lwpolyline([(-0.5, 0.5), (-0.1, 0.5), (-0.1, 0.8), (-0.5, 0.8)], close=True) # Almohada izquierda
    cama.add_lwpolyline([(0.1, 0.5), (0.5, 0.5), (0.5, 0.8), (0.1, 0.8)], close=True) # Almohada derecha

    # --- BLOQUE: SOFA (2.10 x 0.90) ---
    sofa = doc.blocks.new(name='BLOQUE_SOFA')
    sofa.add_lwpolyline([(-1.05, -0.45), (1.05, -0.45), (1.05, 0.45), (-1.05, 0.45)], close=True) # Contorno
    sofa.add_lwpolyline([(-1.05, 0.15), (1.05, 0.15)]) # Respaldo
    sofa.add_lwpolyline([(-0.85, -0.45), (-0.85, 0.15)]) # Brazo izquierdo
    sofa.add_lwpolyline([(0.85, -0.45), (0.85, 0.15)]) # Brazo derecho

    # --- BLOQUE: COCINA (2.40 x 0.60) ---
    cocina = doc.blocks.new(name='BLOQUE_COCINA')
    cocina.add_lwpolyline([(-1.2, -0.3), (1.2, -0.3), (1.2, 0.3), (-1.2, 0.3)], close=True) # Mesada
    cocina.add_circle(center=(-0.6, 0), radius=0.15) # Hornilla 1
    cocina.add_circle(center=(-0.2, 0), radius=0.15) # Hornilla 2
    cocina.add_circle(center=(0.2, 0), radius=0.15) # Hornilla 3
    cocina.add_circle(center=(0.6, 0), radius=0.15) # Hornilla 4

    # --- BLOQUE: INODORO (0.40 x 0.65) ---
    inodoro = doc.blocks.new(name='BLOQUE_INODORO')
    inodoro.add_lwpolyline([(-0.2, -0.325), (0.2, -0.325), (0.2, -0.025), (-0.2, -0.025)], close=True) # Tanque
    inodoro.add_ellipse(center=(0, 0.15), major_axis=(0, 0.2), ratio=0.6) # Taza

    # --- BLOQUE: LAVABO (0.55 x 0.45) ---
    lavabo = doc.blocks.new(name='BLOQUE_LAVABO')
    lavabo.add_lwpolyline([(-0.275, -0.225), (0.275, -0.225), (0.275, 0.225), (-0.275, 0.225)], close=True)
    lavabo.add_ellipse(center=(0, 0), major_axis=(0.2, 0), ratio=0.6) # Ovalin

    # --- BLOQUE: MESA (1.20 x 0.80) ---
    mesa = doc.blocks.new(name='BLOQUE_MESA')
    mesa.add_lwpolyline([(-0.6, -0.4), (0.6, -0.4), (0.6, 0.4), (-0.6, 0.4)], close=True)
    mesa.add_circle(center=(-0.3, -0.5), radius=0.1) # Silla
    mesa.add_circle(center=(0.3, -0.5), radius=0.1) # Silla
    mesa.add_circle(center=(-0.3, 0.5), radius=0.1) # Silla
    mesa.add_circle(center=(0.3, 0.5), radius=0.1) # Silla

    # Crear la carpeta y guardar el archivo
    os.makedirs("app/templates", exist_ok=True)
    ruta = "app/templates/plantilla_vipromt.dxf"
    doc.saveas(ruta)
    print(f"¡Éxito! Plantilla gráfica generada en: {ruta}")

if __name__ == "__main__":
    generar_plantilla()