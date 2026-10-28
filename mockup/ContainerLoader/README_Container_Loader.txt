Container Loader Demo (All-in-One)
====================================
Files in this package:
- container_loader_demo.py  (run this)
   >>python container_loader_demo.py

- ContainerLoadingDemo.xlsx (template; put your real data here)
- Output folder on run: ./output_plan_real (created automatically)

How to run:
1) pip install pandas numpy matplotlib openpyxl xlsxwriter plotly
2) Put your data into ContainerLoadingDemo.xlsx (3 sheets: Containers, Items, Settings)
3) python container_loader_demo.py
4) See outputs in ./output_plan_real

Notes:
- Heuristic only (shelf + height buckets). Not guaranteed optimal.
- Weight-balance checks are approximate.
- Customize run(excel_path, out_dir) at the bottom for your paths.


https://chatgpt.com/share/68ab1efb-d1c8-800e-ac08-f7f374203309