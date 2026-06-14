with open(r'c:\Users\Administrator\Desktop\Dominal\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's extract everything between CLIENTS SECTION and the next big section header in style
css_start = content.find('/* ====================================\n   CLIENTS SECTION')
if css_start == -1:
    css_start = content.find('CLIENTS SECTION')

if css_start != -1:
    css_end = content.find('/*', css_start + 100)
    print("Found CSS range from", css_start, "to", css_end)
    print(content[css_start:css_end])
else:
    print("Could not find style comment for CLIENTS SECTION")
