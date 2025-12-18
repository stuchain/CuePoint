#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate application icons from logo.png

Converts the logo.png to:
- build/icon.ico (Windows)
- build/icon.icns (macOS)

This script should be run before building the application.
"""

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: PIL (Pillow) is required. Install it with: pip install Pillow")
    sys.exit(1)


def create_ico(logo_path: Path, output_path: Path) -> bool:
    """Create ICO file from PNG for Windows.
    
    Args:
        logo_path: Path to source logo.png
        output_path: Path to output icon.ico
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Open the logo
        img = Image.open(logo_path)
        
        # ICO format requires multiple sizes
        # Windows uses: 16x16, 32x32, 48x48, 256x256
        sizes = [(16, 16), (32, 32), (48, 48), (256, 256)]
        
        # Create list of images at different sizes
        images = []
        for size in sizes:
            resized = img.resize(size, Image.Resampling.LANCZOS)
            images.append(resized)
        
        # Save as ICO
        images[0].save(
            output_path,
            format='ICO',
            sizes=[(img.width, img.height) for img in images],
            append_images=images[1:] if len(images) > 1 else []
        )
        
        print(f"[OK] Created {output_path}")
        return True
    except Exception as e:
        print(f"[ERROR] Error creating ICO: {e}")
        return False


def create_icns(logo_path: Path, output_path: Path) -> bool:
    """Create ICNS file from PNG for macOS.
    
    Note: This is a simplified version. For production, you may want to use
    iconutil (macOS only) or a more sophisticated tool.
    
    Args:
        logo_path: Path to source logo.png
        output_path: Path to output icon.icns
        
    Returns:
        True if successful, False otherwise
    """
    try:
        import platform
        
        # On macOS, use iconutil if available
        if platform.system() == 'Darwin':
            import subprocess
            import tempfile
            import shutil
            
            # Create temporary iconset directory
            with tempfile.TemporaryDirectory() as tmpdir:
                iconset_dir = Path(tmpdir) / 'icon.iconset'
                iconset_dir.mkdir()
                
                # ICNS requires these sizes
                sizes = [
                    (16, 16, 'icon_16x16.png'),
                    (32, 32, 'icon_16x16@2x.png'),
                    (32, 32, 'icon_32x32.png'),
                    (64, 64, 'icon_32x32@2x.png'),
                    (128, 128, 'icon_128x128.png'),
                    (256, 256, 'icon_128x128@2x.png'),
                    (256, 256, 'icon_256x256.png'),
                    (512, 512, 'icon_256x256@2x.png'),
                    (512, 512, 'icon_512x512.png'),
                    (1024, 1024, 'icon_512x512@2x.png'),
                ]
                
                # Open and resize logo
                img = Image.open(logo_path)
                
                # Create all sizes
                for width, height, filename in sizes:
                    resized = img.resize((width, height), Image.Resampling.LANCZOS)
                    resized.save(iconset_dir / filename, 'PNG')
                
                # Use iconutil to create ICNS
                try:
                    subprocess.run(
                        ['iconutil', '-c', 'icns', str(iconset_dir), '-o', str(output_path)],
                        check=True,
                        capture_output=True
                    )
                    print(f"[OK] Created {output_path} (using iconutil)")
                    return True
                except (subprocess.CalledProcessError, FileNotFoundError):
                    print("[WARNING] iconutil not available, creating simplified ICNS")
                    # Fallback: just copy a large PNG (not ideal, but works)
                    img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
                    img_512.save(output_path.with_suffix('.png'))
                    print(f"[WARNING] Created PNG fallback (not a proper ICNS)")
                    print(f"  For proper ICNS, run on macOS with iconutil or use an online converter")
                    return False
        else:
            # On non-macOS, we can't create proper ICNS
            # Just create a high-res PNG as placeholder
            img = Image.open(logo_path)
            img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
            output_path_png = output_path.with_suffix('.png')
            img_512.save(output_path_png)
            print(f"[WARNING] Created PNG placeholder for ICNS (not a proper ICNS)")
            print(f"  For proper ICNS, convert {output_path_png} using:")
            print(f"  - macOS: iconutil or online converter")
            print(f"  - Online: https://cloudconvert.com/png-to-icns")
            return False
            
    except Exception as e:
        print(f"[ERROR] Error creating ICNS: {e}")
        return False


def main():
    """Main function to generate icons"""
    # Get project root (parent of scripts/)
    project_root = Path(__file__).parent.parent
    
    # Paths
    logo_path = project_root / 'SRC' / 'cuepoint' / 'ui' / 'assets' / 'icons' / 'logo.png'
    build_dir = project_root / 'build'
    build_dir.mkdir(exist_ok=True)
    
    ico_path = build_dir / 'icon.ico'
    icns_path = build_dir / 'icon.icns'
    
    # Check if logo exists
    if not logo_path.exists():
        print(f"Error: Logo not found at {logo_path}")
        print("Please ensure logo.png exists at SRC/cuepoint/ui/assets/icons/logo.png")
        sys.exit(1)
    
    print(f"Generating icons from {logo_path}...")
    print()
    
    # Create ICO for Windows
    print("Creating Windows icon (ICO)...")
    ico_success = create_ico(logo_path, ico_path)
    print()
    
    # Create ICNS for macOS
    print("Creating macOS icon (ICNS)...")
    icns_success = create_icns(logo_path, icns_path)
    print()
    
    # Summary
    if ico_success:
        print(f"[OK] Windows icon ready: {ico_path}")
    else:
        print(f"[ERROR] Windows icon creation failed")
    
    if icns_success:
        print(f"[OK] macOS icon ready: {icns_path}")
    else:
        print(f"[WARNING] macOS icon may need manual conversion")
        print(f"  See instructions above for creating proper ICNS file")
    
    print()
    if ico_success:
        print("Icons generated successfully!")
        print("You can now build the application with PyInstaller.")
    else:
        print("Some icons failed to generate. Please check the errors above.")
        sys.exit(1)


if __name__ == '__main__':
    main()
