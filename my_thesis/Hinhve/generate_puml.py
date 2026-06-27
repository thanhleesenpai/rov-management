import sys
import os
import glob

def run():
    try:
        from plantuml import PlantUML
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "plantuml"])
        from plantuml import PlantUML

    puml = PlantUML(url='http://www.plantuml.com/plantuml/png/')

    # Run from Hinhve directory
    # script_dir = os.path.dirname(os.path.abspath(__file__))
    # puml_files = sorted(glob.glob(os.path.join(script_dir, '*.puml')))

    # if not puml_files:
    #     print("No .puml files found.")
    #     sys.exit(1)
    # Nhận tham số từ terminal nếu có, nếu không thì mặc định chạy file act_data_workflow.puml
    target_file = sys.argv[1] if len(sys.argv) > 1 else 'act_data_workflow.puml'
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    puml_files = glob.glob(os.path.join(script_dir, target_file))

    if not puml_files:
        print(f"No file found matching: {target_file}")
        sys.exit(1)

        

    print(f"Found {len(puml_files)} .puml files\n")

    success = 0
    failed = []

    for puml_file in puml_files:
        name = os.path.basename(puml_file)
        png_file = puml_file.replace('.puml', '.png')
        print(f"  {name} -> {os.path.basename(png_file)} ...", end='', flush=True)
        try:
            with open(puml_file, 'r', encoding='utf-8') as f:
                data = f.read()
            result = puml.processes(data)
            if result:
                with open(png_file, 'wb') as f:
                    f.write(result)
                print(" OK")
                success += 1
            else:
                print(" FAILED (empty response)")
                failed.append(name)
        except Exception as e:
            print(f" FAILED ({e})")
            failed.append(name)

    print(f"\n{success}/{len(puml_files)} succeeded.")
    if failed:
        print("Failed:", ', '.join(failed))
        sys.exit(1)

if __name__ == '__main__':
    run()
